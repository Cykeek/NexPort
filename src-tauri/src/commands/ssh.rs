use std::sync::Arc;
use std::time::Duration;
use tauri::State;
use zeroize::Zeroize;
use crate::state::AppState;
use crate::ssh::session::SshSession;
use crate::ssh::session::get_known_hosts_path;
use crate::error::{AppResult, AppError};
use crate::commands::utils::{
    validate_identifier, load_connection_credentials,
    has_control_chars,
};
use crate::ssh::known_hosts::list_known_hosts_path;

const MAX_SESSION_ID_LEN: usize = 128;
const MAX_CONNECTION_ID_LEN: usize = 128;
const MAX_USERNAME_LEN: usize = 128;
const MAX_PASSWORD_LEN: usize = 4096;
const MAX_PRIVATE_KEY_LEN: usize = 64 * 1024;
const MAX_SSH_WRITE_BYTES: usize = 1024 * 1024;
const MAX_SSH_READ_TIMEOUT_MS: u64 = 5000;
const MAX_TERMINAL_COLS: u32 = 2000;
const MAX_TERMINAL_ROWS: u32 = 1000;

/// Validate connection parameters to prevent malformed or malicious input.
fn validate_connection_params(host: &str, port: u16, username: &str) -> AppResult<()> {
    if host.trim().is_empty() {
        return Err(AppError::SshConnection("Hostname cannot be empty".to_string()));
    }
    if host.contains('/') || host.contains('\\') || host.contains('\0') {
        return Err(AppError::SshConnection("Invalid hostname".to_string()));
    }
    if host.len() > 255 {
        return Err(AppError::SshConnection("Hostname too long".to_string()));
    }
    if username.trim().is_empty() {
        return Err(AppError::SshConnection("Username cannot be empty".to_string()));
    }
    if has_control_chars(username) || username.len() > MAX_USERNAME_LEN {
        return Err(AppError::SshConnection("Invalid username".to_string()));
    }
    if port == 0 {
        return Err(AppError::SshConnection("Invalid port".to_string()));
    }
    Ok(())
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
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;

    // Default to TOFU for backward compatibility
    let tofu = trust_on_first_use.unwrap_or(true);

    let (mut final_password, mut final_key_data, final_host, final_port, final_username) =
        if let Some(ref conn_id) = connection_id {
            validate_identifier(conn_id, "connection ID", MAX_CONNECTION_ID_LEN)?;
            let creds = load_connection_credentials(&state, conn_id, MAX_CONNECTION_ID_LEN)?;
            (creds.password, creds.key_data, creds.host, creds.port, creds.username)
        } else {
            (password, key_data, host.clone(), port, username.clone())
        };

    validate_connection_params(&final_host, final_port, &final_username)?;
    if let Some(ref pw) = final_password {
        if pw.len() > MAX_PASSWORD_LEN || pw.contains('\0') {
            return Err(AppError::InvalidInput("Invalid password".to_string()));
        }
    }
    if let Some(ref kd) = final_key_data {
        if kd.as_bytes().len() > MAX_PRIVATE_KEY_LEN {
            return Err(AppError::InvalidInput(
                "Private key data exceeds allowed size".to_string(),
            ));
        }
    }

    let session = SshSession::connect(
        &final_host,
        final_port,
        &final_username,
        final_password.as_deref(),
        final_key_data.as_deref(),
        tofu,
    )
    .await
    .map_err(|e| AppError::SshConnection(e))?;

    // Zero sensitive data after use.
    if let Some(ref mut pw) = final_password {
        pw.zeroize();
    }
    if let Some(ref mut kd) = final_key_data {
        kd.zeroize();
    }

    let wrapped = Arc::new(tokio::sync::Mutex::new(session));
    state.sessions.insert(session_id.clone(), wrapped);
    Ok(session_id)
}

#[tauri::command]
pub async fn ssh_disconnect(
    session_id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;

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
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;

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
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    if cols == 0 || rows == 0 || cols > MAX_TERMINAL_COLS || rows > MAX_TERMINAL_ROWS {
        return Err(AppError::InvalidInput("Invalid terminal dimensions".to_string()));
    }

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
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    if data.as_bytes().len() > MAX_SSH_WRITE_BYTES {
        return Err(AppError::InvalidInput(
            "SSH write payload exceeds allowed size".to_string(),
        ));
    }

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
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;

    let session = state.sessions.get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    let session = session.clone();
    let mut session = session.lock().await;
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(100).clamp(10, MAX_SSH_READ_TIMEOUT_MS));
    let data = session.read(timeout).await
        .map_err(|e| AppError::SshConnection(e))?;
    Ok(data)
}

#[tauri::command]
pub async fn ssh_detect_os(
    connection_id: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    validate_identifier(&connection_id, "connection ID", MAX_CONNECTION_ID_LEN)?;

    // Fetch connection details and credentials from database
    let mut creds = load_connection_credentials(&state, &connection_id, MAX_CONNECTION_ID_LEN)?;

    // Create a separate SSH session for detection (always use TOFU for background detection)
    let session = SshSession::connect(
        &creds.host,
        creds.port,
        &creds.username,
        creds.password.as_deref(),
        creds.key_data.as_deref(),
        true, // Always use TOFU for OS detection
    )
    .await
    .map_err(|e| AppError::SshConnection(e))?;

    // Zero sensitive data after use.
    if let Some(ref mut pw) = creds.password {
        pw.zeroize();
    }
    if let Some(ref mut kd) = creds.key_data {
        kd.zeroize();
    }

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

#[tauri::command]
pub fn list_known_hosts() -> AppResult<Vec<crate::ssh::known_hosts::KnownHostEntry>> {
    let known_hosts_path = get_known_hosts_path();
    list_known_hosts_path(&known_hosts_path)
        .map_err(|e| AppError::SshConnection(e))
}
