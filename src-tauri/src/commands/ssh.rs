use std::sync::Arc;
use std::time::Duration;
use tauri::State;
use crate::state::AppState;
use crate::ssh::session::SshSession;
use crate::error::{AppResult, AppError};
use crate::commands::connections::ConnectionProfile;
use crate::crypto::decrypt_field;
use base64::Engine;

const CONNECTIONS_TABLE: redb::TableDefinition<&str, &str> = redb::TableDefinition::new("connections");
const KEYS_TABLE: redb::TableDefinition<&str, &str> = redb::TableDefinition::new("keys");

fn decrypt_key_data(vault: &std::sync::Mutex<crate::vault::encryptor::Vault>, encrypted_b64: &str) -> Result<String, AppError> {
    let encrypted = base64::engine::general_purpose::STANDARD.decode(encrypted_b64).map_err(|e| AppError::Database(e.to_string()))?;
    let vault = vault.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let decrypted = vault.decrypt(&encrypted).map_err(|e| AppError::Database(e))?;
    String::from_utf8(decrypted).map_err(|e| AppError::Database(e.to_string()))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredKey {
    #[allow(dead_code)]
    pub id: String,
    #[allow(dead_code)]
    pub name: String,
    #[allow(dead_code)]
    pub key_type: String,
    #[allow(dead_code)]
    pub fingerprint: String,
    pub encrypted_key_data: String,
}

#[tauri::command]
pub async fn ssh_connect(
    session_id: String,
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    key_data: Option<String>,
    connection_id: Option<String>,
    trust_on_first_use: Option<bool>,
    state: State<'_, AppState>,
) -> AppResult<String> {
    // Default to TOFU for backward compatibility
    let tofu = trust_on_first_use.unwrap_or(true);
    
    let (final_password, final_key_data) = if let Some(ref conn_id) = connection_id {
        // Ensure database exists
        let db_guard = match state.get_db() {
            Ok(guard) => guard,
            Err(_) => return Err(AppError::Database("Database not initialized".to_string())),
        };
        let db = match db_guard.as_ref() {
            Some(db) => db,
            None => return Err(AppError::Database("Database not initialized".to_string())),
        };
        
        let read_txn = db.begin_read()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let connections_table = read_txn.open_table(CONNECTIONS_TABLE)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let value = connections_table.get(conn_id.as_str())
            .map_err(|e| AppError::Database(e.to_string()))?
            .ok_or_else(|| AppError::Database("Connection not found".to_string()))?;

        let profile: ConnectionProfile = serde_json::from_str(value.value())
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Decrypt password for authentication
        let final_password = if let Some(ref encrypted) = profile.encrypted_password {
            if !encrypted.is_empty() {
                match decrypt_field(&state.vault, encrypted) {
                    Ok(decrypted) => Some(decrypted),
                    Err(_) => profile.encrypted_password.clone(),
                }
            } else {
                None
            }
        } else {
            None
        };

        let final_key_data = if let Some(ref key_id) = profile.key_id {
            let keys_table = read_txn.open_table(KEYS_TABLE)
                .map_err(|e| AppError::Database(e.to_string()))?;

            let key_value = keys_table.get(key_id.as_str())
                .map_err(|e| AppError::Database(e.to_string()))?
                .ok_or_else(|| AppError::Database("Key not found".to_string()))?;

            let stored_key: StoredKey = serde_json::from_str(key_value.value())
                .map_err(|e| AppError::Database(e.to_string()))?;

            // Decrypt the key data
            let decrypted_key = match decrypt_key_data(&state.vault, &stored_key.encrypted_key_data) {
                Ok(key) => key,
                Err(_) => stored_key.encrypted_key_data,
            };
            
            let mut key_data = decrypted_key;
            if !key_data.ends_with('\n') {
                key_data.push('\n');
            }
            Some(key_data)
        } else {
            None
        };

        (final_password, final_key_data)
    } else {
        (password, key_data)
    };

    let session = SshSession::connect(
        &host,
        port,
        &username,
        final_password.as_deref(),
        final_key_data.as_deref(),
        tofu,
    )
    .await
    .map_err(|e| AppError::SshConnection(e))?;

    let wrapped = Arc::new(tokio::sync::Mutex::new(session));
    state.sessions.insert(session_id.clone(), wrapped);
    Ok(session_id)
}

#[tauri::command]
pub async fn ssh_disconnect(
    session_id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    if let Some((_, session)) = state.sessions.remove(&session_id) {
        let mut session = session.lock().await;
        session.disconnect().await.ok();
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_is_connected(
    session_id: String,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    // Simple check: just verify session exists in our map
    // The actual connection health is checked via ssh_read errors
    Ok(state.sessions.contains_key(&session_id))
}

#[tauri::command]
pub async fn ssh_resize(
    session_id: String,
    cols: u32,
    rows: u32,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let session = state.sessions.get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    let session = session.clone();
    let mut session = session.lock().await;
    session.resize(cols, rows).await
        .map_err(|e| AppError::SshConnection(e))?;
    Ok(())
}

#[tauri::command]
pub async fn ssh_write(
    session_id: String,
    data: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let session = state.sessions.get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    let session = session.clone();
    let mut session = session.lock().await;
    session.write(&data).await
        .map_err(|e| AppError::SshConnection(e))?;
    Ok(())
}

#[tauri::command]
pub async fn ssh_read(
    session_id: String,
    timeout_ms: Option<u64>,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let session = state.sessions.get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    let session = session.clone();
    let mut session = session.lock().await;
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(100));
    let data = session.read(timeout).await
        .map_err(|e| AppError::SshConnection(e))?;
    Ok(data)
}

#[tauri::command]
pub async fn ssh_detect_os(
    connection_id: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    // Fetch connection details and credentials from database
    let (host, port, username, final_password, final_key_data) = {
        // Ensure database exists
        let db_guard = match state.get_db() {
            Ok(guard) => guard,
            Err(_) => return Err(AppError::Database("Database not initialized".to_string())),
        };
        let db = match db_guard.as_ref() {
            Some(db) => db,
            None => return Err(AppError::Database("Database not initialized".to_string())),
        };
        
        let read_txn = db.begin_read()
            .map_err(|e| AppError::Database(e.to_string()))?;
        
        let connections_table = read_txn.open_table(CONNECTIONS_TABLE)
            .map_err(|e| AppError::Database(e.to_string()))?;
        
        let value = connections_table.get(connection_id.as_str())
            .map_err(|e| AppError::Database(e.to_string()))?
            .ok_or_else(|| AppError::Database("Connection not found".to_string()))?;
        
        let profile: ConnectionProfile = serde_json::from_str(value.value())
            .map_err(|e| AppError::Database(e.to_string()))?;
        
        let host = profile.host.clone();
        let port = profile.port;
        let username = profile.username.clone();
        
        // Decrypt password for authentication
        let final_password = if let Some(ref encrypted) = profile.encrypted_password {
            if !encrypted.is_empty() {
                match decrypt_field(&state.vault, encrypted) {
                    Ok(decrypted) => Some(decrypted),
                    Err(_) => profile.encrypted_password.clone(),
                }
            } else {
                None
            }
        } else {
            None
        };
        
        let final_key_data = if let Some(ref key_id) = profile.key_id {
            let keys_table = read_txn.open_table(KEYS_TABLE)
                .map_err(|e| AppError::Database(e.to_string()))?;
            
            let key_value = keys_table.get(key_id.as_str())
                .map_err(|e| AppError::Database(e.to_string()))?
                .ok_or_else(|| AppError::Database("Key not found".to_string()))?;
            
            let stored_key: StoredKey = serde_json::from_str(key_value.value())
                .map_err(|e| AppError::Database(e.to_string()))?;
            
            // Decrypt the key data
            let decrypted_key = match decrypt_key_data(&state.vault, &stored_key.encrypted_key_data) {
                Ok(key) => key,
                Err(_) => stored_key.encrypted_key_data,
            };
            
            let mut key_data = decrypted_key;
            if !key_data.ends_with('\n') {
                key_data.push('\n');
            }
            Some(key_data)
        } else {
            None
        };
        
        (host, port, username, final_password, final_key_data)
    };
    
    // Create a separate SSH session for detection (always use TOFU for background detection)
    let session = SshSession::connect(
        &host,
        port,
        &username,
        final_password.as_deref(),
        final_key_data.as_deref(),
        true, // Always use TOFU for OS detection
    )
    .await
    .map_err(|e| AppError::SshConnection(e))?;

    let mut session = session;
    
    session.write("cat /etc/os-release 2>/dev/null || uname -s || echo 'unknown'\n").await
        .map_err(|e| AppError::SshConnection(e))?;
    
    tokio::time::sleep(Duration::from_millis(500)).await;
    
    let mut output = String::new();
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_secs(3) {
        match session.read(Duration::from_millis(200)).await {
            Ok(data) => {
                if data.is_empty() {
                    break;
                }
                output.push_str(&data);
            }
            Err(_) => break,
        }
    }
    
    let os = parse_os_from_output(&output);
    
    session.disconnect().await.ok();
    
    Ok(os)
}

fn parse_os_from_output(output: &str) -> String {
    let lower = output.to_lowercase();
    
    if lower.contains("ubuntu") {
        return "ubuntu".to_string();
    }
    if lower.contains("debian") {
        return "debian".to_string();
    }
    if lower.contains("centos") {
        return "centos".to_string();
    }
    if lower.contains("fedora") {
        return "fedora".to_string();
    }
    if lower.contains("rocky") {
        return "rocky".to_string();
    }
    if lower.contains("alma") {
        return "alma".to_string();
    }
    if lower.contains("amazon") {
        return "amazon".to_string();
    }
    if lower.contains("arch linux") || lower.contains("archlinux") {
        return "arch".to_string();
    }
    if lower.contains("opensuse") || lower.contains("sles") {
        return "opensuse".to_string();
    }
    if lower.contains("red hat") || lower.contains("rhel") {
        return "rhel".to_string();
    }
    if lower.contains("alpine") {
        return "alpine".to_string();
    }
    if lower.contains("gentoo") {
        return "gentoo".to_string();
    }
    if lower.contains("darwin") || lower.contains("macos") {
        return "macos".to_string();
    }
    if lower.contains("mingw") || lower.contains("cygwin") || lower.contains("windows") {
        return "windows".to_string();
    }
    if lower.contains("linux") {
        return "linux".to_string();
    }
    
    "unknown".to_string()
}