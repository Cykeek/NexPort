use serde::{Deserialize, Serialize};
use tauri::State;
use redb::{ReadableTable, TableDefinition};
use crate::state::AppState;
use crate::error::{AppResult, AppError};
use crate::crypto::encrypt_field;
use std::time::Duration;

const CONNECTIONS_TABLE: TableDefinition<&str, &str> = TableDefinition::new("connections");

/// Internal representation stored in the database — contains the encrypted password.
/// This struct is NEVER serialized to the frontend directly.
#[derive(Serialize, Deserialize, Clone)]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    #[serde(default)]
    pub encrypted_password: Option<String>,
    #[serde(default)]
    pub key_id: Option<String>,
    pub group: Option<String>,
    #[serde(default)]
    pub detected_os: Option<String>,
    #[serde(default)]
    pub last_connected: Option<String>,
    #[serde(default)]
    pub session_count: u32,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub host_fingerprint: Option<String>,
    #[serde(default)]
    pub response_time_ms: Option<u32>,
}

/// Frontend-safe representation — never exposes the encrypted password.
/// Uses snake_case to match the existing frontend TypeScript type.
#[derive(Serialize, Deserialize, Clone)]
pub struct ConnectionProfileView {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    #[serde(default)]
    pub key_id: Option<String>,
    pub group: Option<String>,
    #[serde(default)]
    pub detected_os: Option<String>,
    /// True if a password is stored for this connection (frontend-safe indicator).
    #[serde(default)]
    pub has_password: bool,
    #[serde(default)]
    pub last_connected: Option<String>,
    #[serde(default)]
    pub session_count: u32,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub host_fingerprint: Option<String>,
    #[serde(default)]
    pub response_time_ms: Option<u32>,
}

impl ConnectionProfile {
    /// Convert the internal profile to a frontend-safe view, stripping the encrypted password.
    pub fn to_view(&self) -> ConnectionProfileView {
        ConnectionProfileView {
            id: self.id.clone(),
            name: self.name.clone(),
            host: self.host.clone(),
            port: self.port,
            username: self.username.clone(),
            auth_method: self.auth_method.clone(),
            key_id: self.key_id.clone(),
            group: self.group.clone(),
            detected_os: self.detected_os.clone(),
            has_password: self.encrypted_password.as_ref().map(|p| !p.is_empty()).unwrap_or(false),
            last_connected: self.last_connected.clone(),
            session_count: self.session_count,
            tags: self.tags.clone(),
            host_fingerprint: self.host_fingerprint.clone(),
            response_time_ms: self.response_time_ms.clone(),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HostStatus {
    Online,
    Offline,
    Unknown,
}

#[derive(Serialize)]
pub struct HostCheckResult {
    pub status: HostStatus,
    pub response_time_ms: Option<u32>,
}

#[tauri::command]
pub async fn check_host_status(host: String, port: u16) -> Result<HostCheckResult, String> {
    // Validate input to prevent malformed hostnames from reaching the network stack.
    if host.trim().is_empty() || host.len() > 255 || host.contains('/') || host.contains('\\') || host.contains('\0') {
        return Err("Invalid hostname".to_string());
    }
    if port == 0 {
        return Err("Invalid port".to_string());
    }

    let addr = format!("{}:{}", host, port);
    let start = std::time::Instant::now();

    match tokio::time::timeout(
        Duration::from_secs(3),
        tokio::net::TcpStream::connect(&addr)
    ).await {
        Ok(Ok(_stream)) => {
            let elapsed = start.elapsed().as_millis() as u32;
            Ok(HostCheckResult { status: HostStatus::Online, response_time_ms: Some(elapsed) })
        },
        Ok(Err(_e)) => Ok(HostCheckResult { status: HostStatus::Offline, response_time_ms: None }),
        Err(_e) => Ok(HostCheckResult { status: HostStatus::Unknown, response_time_ms: None }),
    }
}

#[tauri::command]
pub fn save_connection(
    mut profile: ConnectionProfile,
    state: State<'_, AppState>,
) -> AppResult<ConnectionProfileView> {
    state.ensure_database().map_err(|e| AppError::Database(e.to_string()))?;

    // If the frontend sent a password, encrypt it.
    if let Some(ref password) = profile.encrypted_password {
        if !password.is_empty() {
            let encrypted = encrypt_field(&state.vault, password)?;
            profile.encrypted_password = Some(encrypted);
        }
    } else {
        // No password sent — check if this is an update to an existing connection.
        // If so, preserve the existing encrypted password.
        let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
        let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

        if let Ok(read_txn) = db.begin_read() {
            if let Ok(table) = read_txn.open_table(CONNECTIONS_TABLE) {
                if let Ok(Some(value)) = table.get(profile.id.as_str()) {
                    if let Ok(existing) = serde_json::from_str::<ConnectionProfile>(value.value()) {
                        profile.encrypted_password = existing.encrypted_password;
                    }
                }
            }
        }
    }

    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let json = serde_json::to_string(&profile).map_err(|e| AppError::Database(e.to_string()))?;
    let write_txn = db.begin_write()
        .map_err(|e| AppError::Database(e.to_string()))?;
    {
        let mut table = write_txn.open_table(CONNECTIONS_TABLE)
            .map_err(|e| AppError::Database(e.to_string()))?;
        table.insert(profile.id.as_str(), json.as_str())
            .map_err(|e| AppError::Database(e.to_string()))?;
    }
    write_txn.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(profile.to_view())
}

#[tauri::command]
pub fn get_connections(
    state: State<'_, AppState>,
) -> AppResult<Vec<ConnectionProfileView>> {
    let db_guard = match state.get_db() {
        Ok(guard) => guard,
        Err(_) => return Ok(Vec::new()),
    };
    let db = match db_guard.as_ref() {
        Some(db) => db,
        None => return Ok(Vec::new()),
    };

    let read_txn = db.begin_read()
        .map_err(|e| AppError::Database(e.to_string()))?;
    let table = read_txn.open_table(CONNECTIONS_TABLE)
        .map_err(|e| AppError::Database(e.to_string()))?;
    let mut connections = Vec::new();
    for row in table.iter().map_err(|e| AppError::Database(e.to_string()))? {
        let (_, value) = row.map_err(|e| AppError::Database(e.to_string()))?;
        let profile: ConnectionProfile = serde_json::from_str(value.value())
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Return a frontend-safe view — never exposes the encrypted password.
        connections.push(profile.to_view());
    }
    Ok(connections)
}

#[tauri::command]
pub fn delete_connection(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    
    let write_txn = db.begin_write()
        .map_err(|e| AppError::Database(e.to_string()))?;
    {
        let mut table = write_txn.open_table(CONNECTIONS_TABLE)
            .map_err(|e| AppError::Database(e.to_string()))?;
        table.remove(id.as_str())
            .map_err(|e| AppError::Database(e.to_string()))?;
    }
    write_txn.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Record a successful connection — updates last_connected, session_count, fingerprint, response_time.
#[tauri::command]
pub fn record_connection_session(
    id: String,
    fingerprint: Option<String>,
    response_time_ms: Option<u32>,
    state: State<'_, AppState>,
) -> AppResult<ConnectionProfileView> {
    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let read_txn = db.begin_read().map_err(|e| AppError::Database(e.to_string()))?;
    let value = read_txn.open_table(CONNECTIONS_TABLE)
        .map_err(|e| AppError::Database(e.to_string()))?
        .get(id.as_str())
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::Database("Connection not found".to_string()))?;

    let mut profile: ConnectionProfile = serde_json::from_str(value.value())
        .map_err(|e| AppError::Database(e.to_string()))?;

    // Update metadata
    profile.last_connected = Some(chrono_now_iso());
    profile.session_count += 1;
    if let Some(fp) = fingerprint {
        profile.host_fingerprint = Some(fp);
    }
    if let Some(rt) = response_time_ms {
        profile.response_time_ms = Some(rt);
    }

    let write_txn = db.begin_write().map_err(|e| AppError::Database(e.to_string()))?;
    {
        let mut table = write_txn.open_table(CONNECTIONS_TABLE)
            .map_err(|e| AppError::Database(e.to_string()))?;
        let json = serde_json::to_string(&profile).map_err(|e| AppError::Database(e.to_string()))?;
        table.insert(id.as_str(), json.as_str()).map_err(|e| AppError::Database(e.to_string()))?;
    }
    write_txn.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(profile.to_view())
}

/// Update tags for a connection.
#[tauri::command]
pub fn update_connection_tags(
    id: String,
    tags: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<ConnectionProfileView> {
    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let read_txn = db.begin_read().map_err(|e| AppError::Database(e.to_string()))?;
    let value = read_txn.open_table(CONNECTIONS_TABLE)
        .map_err(|e| AppError::Database(e.to_string()))?
        .get(id.as_str())
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::Database("Connection not found".to_string()))?;

    let mut profile: ConnectionProfile = serde_json::from_str(value.value())
        .map_err(|e| AppError::Database(e.to_string()))?;

    profile.tags = tags;

    let write_txn = db.begin_write().map_err(|e| AppError::Database(e.to_string()))?;
    {
        let mut table = write_txn.open_table(CONNECTIONS_TABLE)
            .map_err(|e| AppError::Database(e.to_string()))?;
        let json = serde_json::to_string(&profile).map_err(|e| AppError::Database(e.to_string()))?;
        table.insert(id.as_str(), json.as_str()).map_err(|e| AppError::Database(e.to_string()))?;
    }
    write_txn.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(profile.to_view())
}

/// Simple ISO 8601 timestamp without external chrono dependency.
fn chrono_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    // Format as a simple Unix timestamp string — frontend will format it.
    format!("{}", secs)
}

#[tauri::command]
pub fn update_connection_os(
    id: String,
    os: String,
    state: State<'_, AppState>,
) -> AppResult<ConnectionProfileView> {
    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    
    let read_txn = db.begin_read()
        .map_err(|e| AppError::Database(e.to_string()))?;
    
    let value = read_txn.open_table(CONNECTIONS_TABLE)
        .map_err(|e| AppError::Database(e.to_string()))?
        .get(id.as_str())
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::Database("Connection not found".to_string()))?;
    
    let mut profile: ConnectionProfile = serde_json::from_str(value.value())
        .map_err(|e| AppError::Database(e.to_string()))?;
    
    profile.detected_os = Some(os);
    
    let write_txn = db.begin_write()
        .map_err(|e| AppError::Database(e.to_string()))?;
    {
        let mut table = write_txn.open_table(CONNECTIONS_TABLE)
            .map_err(|e| AppError::Database(e.to_string()))?;
        let json = serde_json::to_string(&profile)
            .map_err(|e| AppError::Database(e.to_string()))?;
        table.insert(id.as_str(), json.as_str())
            .map_err(|e| AppError::Database(e.to_string()))?;
    }
    write_txn.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(profile.to_view())
}