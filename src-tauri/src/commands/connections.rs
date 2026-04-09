use serde::{Deserialize, Serialize};
use tauri::State;
use redb::{ReadableTable, TableDefinition};
use crate::state::AppState;
use crate::error::{AppResult, AppError};
use crate::crypto::{encrypt_field, decrypt_field};
use std::time::Duration;

const CONNECTIONS_TABLE: TableDefinition<&str, &str> = TableDefinition::new("connections");

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
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HostStatus {
    Online,
    Offline,
    Unknown,
}

#[tauri::command]
pub async fn check_host_status(host: String, port: u16) -> Result<HostStatus, String> {
    let addr = format!("{}:{}", host, port);
    
    match tokio::time::timeout(
        Duration::from_secs(3),
        tokio::net::TcpStream::connect(&addr)
    ).await {
        Ok(Ok(_stream)) => Ok(HostStatus::Online),
        Ok(Err(_e)) => Ok(HostStatus::Offline),
        Err(_e) => Ok(HostStatus::Unknown),
    }
}

#[tauri::command]
pub fn save_connection(
    mut profile: ConnectionProfile,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.ensure_database().map_err(|e| AppError::Database(e.to_string()))?;
    
    if let Some(ref password) = profile.encrypted_password {
        if !password.is_empty() {
            let encrypted = encrypt_field(&state.vault, password)?;
            profile.encrypted_password = Some(encrypted);
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
    Ok(())
}

#[tauri::command]
pub fn get_connections(
    state: State<'_, AppState>,
) -> AppResult<Vec<ConnectionProfile>> {
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
        let mut profile: ConnectionProfile = serde_json::from_str(value.value())
            .map_err(|e| AppError::Database(e.to_string()))?;
        
        if let Some(ref encrypted) = profile.encrypted_password {
            if !encrypted.is_empty() {
                if let Ok(decrypted) = decrypt_field(&state.vault, encrypted) {
                    profile.encrypted_password = Some(decrypted);
                }
            }
        }
        
        connections.push(profile);
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

#[tauri::command]
pub fn update_connection_os(
    id: String,
    os: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
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
    Ok(())
}