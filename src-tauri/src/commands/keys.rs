use serde::{Deserialize, Serialize};
use tauri::State;
use redb::{ReadableTable, TableDefinition};
use crate::state::AppState;
use crate::error::{AppResult, AppError};
use crate::crypto::{encrypt_key_data, decrypt_key_data};
use ssh_key::{LineEnding, PrivateKey as SshPrivateKey};
use russh_keys::{PrivateKey, PublicKey};
use zeroize::Zeroize;
use rand::thread_rng;
use russh_keys::Algorithm as RusshAlgorithm;

const KEYS_TABLE: TableDefinition<&str, &str> = TableDefinition::new("keys");

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoredKey {
    pub id: String,
    pub name: String,
    pub key_type: String,
    pub fingerprint: String,
    pub encrypted_key_data: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyInfo {
    pub id: String,
    pub name: String,
    pub key_type: String,
    pub fingerprint: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyData {
    pub id: String,
    pub name: String,
    pub key_type: String,
    pub fingerprint: String,
    pub public_key: String,
    pub private_key: String,
}

#[allow(dead_code)]
fn calculate_fingerprint(public_key: &PublicKey) -> String {
    public_key.fingerprint(Default::default()).to_string()
}

fn save_key_to_db(state: &State<'_, AppState>, id: &str, stored_key: &StoredKey) -> AppResult<()> {
    state.ensure_database().map_err(|e| AppError::Database(e.to_string()))?;
    
    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    
    let json = serde_json::to_string(stored_key).map_err(|e| AppError::Database(e.to_string()))?;
    let write_txn = db.begin_write().map_err(|e| AppError::Database(e.to_string()))?;
    { let mut table = write_txn.open_table(KEYS_TABLE).map_err(|e| AppError::Database(e.to_string()))?; table.insert(id, json.as_str()).map_err(|e| AppError::Database(e.to_string()))?; }
    write_txn.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

// Parse an OpenSSH-format private key of any supported type
// (ed25519, RSA, ECDSA). Delegates to the `ssh_key` crate instead
// of fragile byte-offset manipulation.
fn parse_private_key(raw: &str) -> Result<PrivateKey, String> {
    let normalized = raw.trim().replace("\r\n", "\n").replace("\r", "\n");
    if normalized.is_empty() {
        return Err("Empty key data".to_string());
    }

    // Use the ssh_key crate's native parser — supports all key types.
    let ssh_privkey = SshPrivateKey::from_openssh(&normalized)
        .map_err(|e| format!("Failed to parse key: {}", e))?;

    // Convert to russh_keys PrivateKey via OpenSSH serialization.
    let openssh = ssh_privkey.to_openssh(LineEnding::LF)
        .map_err(|e| format!("Failed to serialize key: {}", e))?;

    PrivateKey::from_openssh(openssh.as_bytes())
        .map_err(|e| format!("Failed to load key into SSH library: {}", e))
}

#[tauri::command]
pub async fn generate_key(name: String, key_type: String, _passphrase: Option<String>, state: State<'_, AppState>) -> AppResult<KeyInfo> {
    // RSA key generation is CPU-bound and can take several seconds.
    // Offload to a blocking thread to avoid starving the async runtime.
    let algorithm = match key_type.as_str() {
        "ed25519" => RusshAlgorithm::Ed25519,
        "rsa" => RusshAlgorithm::Rsa { hash: None },
        _ => return Err(AppError::Key("Unsupported key type".to_string())),
    };

    let private_key: PrivateKey = tokio::task::spawn_blocking(move || {
        PrivateKey::random(&mut thread_rng(), algorithm)
    })
    .await
    .map_err(|e| AppError::Key(format!("Task panic: {}", e)))
    .and_then(|r| r.map_err(|e| AppError::Key(format!("Gen error: {}", e))))?;

    let public_key = private_key.public_key();
    let fingerprint = public_key.fingerprint(Default::default()).to_string();
    let key_data = private_key.to_openssh(LineEnding::LF).map_err(|e| AppError::Key(format!("Ser: {}", e)))?.to_string();

    // Encrypt the private key before storing
    let encrypted_key_data = encrypt_key_data(&state.vault, &key_data)?;

    let id = format!("key_{}", uuid::Uuid::new_v4());
    save_key_to_db(&state, &id, &StoredKey { id: id.clone(), name: name.clone(), key_type: key_type.clone(), fingerprint: fingerprint.clone(), encrypted_key_data })?;
    Ok(KeyInfo { id, name, key_type, fingerprint })
}

#[tauri::command]
pub async fn import_key(name: String, key_data: String, state: State<'_, AppState>) -> AppResult<KeyInfo> {
    let normalized_key = key_data.trim().to_string();
    
    // Decode to verify it's valid and get fingerprint
    let private_key = parse_private_key(&normalized_key).map_err(AppError::Key)?;
    let public_key = private_key.public_key();
    let fingerprint = public_key.fingerprint(Default::default()).to_string();
    
    // Detect actual key type
    let key_type = match public_key.algorithm() {
        ssh_key::Algorithm::Ed25519 => "ed25519",
        ssh_key::Algorithm::Rsa { .. } => "rsa",
        ssh_key::Algorithm::Ecdsa { .. } => "ecdsa",
        _ => "unknown",
    };
    
    // Encrypt the private key before storing
    let encrypted_key_data = encrypt_key_data(&state.vault, &normalized_key)?;
    
    let id = format!("key_{}", uuid::Uuid::new_v4());
    save_key_to_db(&state, &id, &StoredKey { id: id.clone(), name: name.clone(), key_type: key_type.to_string(), fingerprint: fingerprint.clone(), encrypted_key_data })?;
    Ok(KeyInfo { id, name, key_type: key_type.to_string(), fingerprint })
}

#[tauri::command]
pub async fn list_keys(state: State<'_, AppState>) -> AppResult<Vec<KeyInfo>> {
    // Check if database exists, return empty if not initialized yet
    let db_guard = match state.get_db() {
        Ok(guard) => guard,
        Err(_) => return Ok(Vec::new()), // No database yet = no keys
    };
    let db = match db_guard.as_ref() {
        Some(db) => db,
        None => return Ok(Vec::new()), // No database yet = no keys
    };
    
    let read_txn = db.begin_read().map_err(|e| AppError::Database(e.to_string()))?;
    let table = read_txn.open_table(KEYS_TABLE).map_err(|e| AppError::Database(e.to_string()))?;
    let mut keys = Vec::new();
    for row in table.iter().map_err(|e| AppError::Database(e.to_string()))? {
        let (_, v) = row.map_err(|e| AppError::Database(e.to_string()))?;
        let sk: StoredKey = serde_json::from_str(v.value()).map_err(|e| AppError::Database(e.to_string()))?;
        keys.push(KeyInfo { id: sk.id, name: sk.name, key_type: sk.key_type, fingerprint: sk.fingerprint });
    }
    Ok(keys)
}

#[tauri::command]
pub async fn delete_key(id: String, state: State<'_, AppState>) -> AppResult<()> {
    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    
    let write_txn = db.begin_write().map_err(|e| AppError::Database(e.to_string()))?;
    { let mut t = write_txn.open_table(KEYS_TABLE).map_err(|e| AppError::Database(e.to_string()))?; t.remove(id.as_str()).map_err(|e| AppError::Database(e.to_string()))?; }
    write_txn.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn update_key(id: String, name: String, state: State<'_, AppState>) -> AppResult<()> {
    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    
    let read_txn = db.begin_read().map_err(|e| AppError::Database(e.to_string()))?;
    let table = read_txn.open_table(KEYS_TABLE).map_err(|e| AppError::Database(e.to_string()))?;
    let value = table.get(id.as_str()).map_err(|e| AppError::Database(e.to_string()))?.ok_or_else(|| AppError::Key("Not found".to_string()))?;
    let mut stored_key: StoredKey = serde_json::from_str(value.value()).map_err(|e| AppError::Database(e.to_string()))?;
    stored_key.name = name;
    
    let write_txn = db.begin_write().map_err(|e| AppError::Database(e.to_string()))?;
    { let mut t = write_txn.open_table(KEYS_TABLE).map_err(|e| AppError::Database(e.to_string()))?; 
      let json = serde_json::to_string(&stored_key).map_err(|e| AppError::Database(e.to_string()))?;
      t.insert(id.as_str(), json.as_str()).map_err(|e| AppError::Database(e.to_string()))?; 
    }
    write_txn.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn update_key_with_new_key(id: String, name: String, key_data: String, state: State<'_, AppState>) -> AppResult<()> {
    let normalized_key = key_data.trim().to_string();
    let private_key = parse_private_key(&normalized_key).map_err(AppError::Key)?;
    let public_key = private_key.public_key();
    let fingerprint = public_key.fingerprint(Default::default()).to_string();
    
    // Detect actual key type
    let key_type = match public_key.algorithm() {
        ssh_key::Algorithm::Ed25519 => "ed25519",
        ssh_key::Algorithm::Rsa { .. } => "rsa",
        ssh_key::Algorithm::Ecdsa { .. } => "ecdsa",
        _ => "unknown",
    };
    
    // Encrypt the new key data
    let encrypted_key_data = encrypt_key_data(&state.vault, &normalized_key)?;
    
    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    
    let read_txn = db.begin_read().map_err(|e| AppError::Database(e.to_string()))?;
    let table = read_txn.open_table(KEYS_TABLE).map_err(|e| AppError::Database(e.to_string()))?;
    let value = table.get(id.as_str()).map_err(|e| AppError::Database(e.to_string()))?.ok_or_else(|| AppError::Key("Not found".to_string()))?;
    let stored_key: StoredKey = serde_json::from_str(value.value()).map_err(|e| AppError::Database(e.to_string()))?;
    
    let new_stored_key = StoredKey {
        id: stored_key.id,
        name,
        key_type: key_type.to_string(),
        fingerprint,
        encrypted_key_data,
    };
    
    let write_txn = db.begin_write().map_err(|e| AppError::Database(e.to_string()))?;
    { let mut t = write_txn.open_table(KEYS_TABLE).map_err(|e| AppError::Database(e.to_string()))?; 
      let json = serde_json::to_string(&new_stored_key).map_err(|e| AppError::Database(e.to_string()))?;
      t.insert(id.as_str(), json.as_str()).map_err(|e| AppError::Database(e.to_string()))?; 
    }
    write_txn.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn get_key_data(id: String, state: State<'_, AppState>) -> AppResult<KeyData> {
    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let read_txn = db.begin_read().map_err(|e| AppError::Database(e.to_string()))?;
    let table = read_txn.open_table(KEYS_TABLE).map_err(|e| AppError::Database(e.to_string()))?;
    let value = table.get(id.as_str()).map_err(|e| AppError::Database(e.to_string()))?.ok_or_else(|| AppError::Key("Not found".to_string()))?;
    let stored_key: StoredKey = serde_json::from_str(value.value()).map_err(|e| AppError::Database(e.to_string()))?;

    // Decrypt the private key
    let mut private_key = decrypt_key_data(&state.vault, &stored_key.encrypted_key_data)?;
    let parsed = parse_private_key(&private_key).map_err(AppError::Key)?;
    let public_key = parsed.public_key().to_openssh().map_err(|e| AppError::Key(format!("Ser: {}", e)))?.to_string();

    // Clone for the result, then zero the original decrypted buffer.
    let private_key_for_result = private_key.clone();
    private_key.zeroize();

    Ok(KeyData {
        id: stored_key.id,
        name: stored_key.name,
        key_type: stored_key.key_type,
        fingerprint: stored_key.fingerprint,
        public_key,
        private_key: private_key_for_result,
    })
}
