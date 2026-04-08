use serde::{Deserialize, Serialize};
use tauri::State;
use redb::{ReadableTable, TableDefinition};
use crate::state::AppState;
use crate::error::{AppResult, AppError};
use ssh_key::{LineEnding, PrivateKey as SshPrivateKey};
use russh_keys::{PrivateKey, PublicKey};
use base64::Engine;
use rand::thread_rng;
use russh_keys::Algorithm as RusshAlgorithm;
use ed25519_dalek::SigningKey;

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
    // Ensure database is initialized (lazy init on first save)
    state.ensure_database().map_err(|e| AppError::Database(e.to_string()))?;
    
    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    
    let json = serde_json::to_string(stored_key).map_err(|e| AppError::Database(e.to_string()))?;
    let write_txn = db.begin_write().map_err(|e| AppError::Database(e.to_string()))?;
    { let mut table = write_txn.open_table(KEYS_TABLE).map_err(|e| AppError::Database(e.to_string()))?; table.insert(id, json.as_str()).map_err(|e| AppError::Database(e.to_string()))?; }
    write_txn.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

// SIMPLE key parser - finds ssh-ed25519 and extracts raw key material
fn parse_private_key(raw: &str) -> Result<PrivateKey, String> {
    let normalized = raw.replace("\r\n", "\n").replace("\r", "\n");
    if normalized.is_empty() { return Err("Empty key data".to_string()); }
    if !normalized.contains("-----BEGIN OPENSSH") { return Err("Invalid key format".to_string()); }
    
    let base64_content: String = normalized.lines().filter(|l| !l.starts_with("-----")).collect::<Vec<_>>().join("");
    let decoded = base64::engine::general_purpose::STANDARD.decode(&base64_content).map_err(|e| format!("Base64: {}", e))?;
    
    // Find "ssh-ed25519" in the data
    let keytype = b"ssh-ed25519";
    let pos = decoded.windows(11).position(|w| w == keytype).ok_or("Key type not found")?;
    
    // After keytype: 4 bytes len + 32 bytes public key
    let pubkey_start = pos + 11 + 4;
    let _pubkey_bytes: [u8; 32] = decoded[pubkey_start..pubkey_start+32].try_into().map_err(|_| "Bad pubkey")?;
    
    // Private key section: 8 bytes check + 4 bytes len + keytype(11) + 64 bytes private
    let priv_start = pubkey_start + 32 + 8 + 4 + 11;
    let privkey: [u8; 64] = decoded[priv_start..priv_start+64].try_into().map_err(|_| "Bad privkey")?;
    
    // Create Ed25519 key using ssh_key crate
    let secret: [u8; 32] = privkey[..32].try_into().map_err(|_| "Bad secret")?;
    let signing_key = SigningKey::from_bytes(&secret);
    let verifying_key = signing_key.verifying_key();
    
    use ssh_key::private::{Ed25519Keypair, Ed25519PrivateKey};
    use ssh_key::public::Ed25519PublicKey;
    let keypair = Ed25519Keypair {
        public: Ed25519PublicKey(verifying_key.to_bytes()),
        private: Ed25519PrivateKey::from_bytes(&secret),
    };
    
    let key_data = ssh_key::private::KeypairData::Ed25519(keypair);
    
    let ssh_key = SshPrivateKey::new(key_data, "").map_err(|e| format!("ssh_key error: {}", e))?;
    
    // Convert to russh_keys PrivateKey using from_openssh
    let openssh = ssh_key.to_openssh(LineEnding::LF).map_err(|e| format!("to_openssh: {}", e))?;
    let private_key = PrivateKey::from_openssh(openssh.as_bytes()).map_err(|e| format!("from_openssh: {}", e))?;
    
    Ok(private_key)
}

#[tauri::command]
pub async fn generate_key(name: String, key_type: String, _passphrase: Option<String>, state: State<'_, AppState>) -> AppResult<KeyInfo> {
    let private_key = match key_type.as_str() {
        "ed25519" => PrivateKey::random(&mut thread_rng(), RusshAlgorithm::Ed25519).map_err(|e| AppError::Key(format!("Gen error: {}", e)))?,
        "rsa" => PrivateKey::random(&mut thread_rng(), RusshAlgorithm::Rsa { hash: None }).map_err(|e| AppError::Key(format!("Gen error: {}", e)))?,
        _ => return Err(AppError::Key("Unsupported".to_string())),
    };
    let public_key = private_key.public_key();
    let fingerprint = public_key.fingerprint(Default::default()).to_string();
    let key_data = private_key.to_openssh(LineEnding::LF).map_err(|e| AppError::Key(format!("Ser: {}", e)))?.to_string();
    let id = format!("key_{}", uuid::Uuid::new_v4());
    save_key_to_db(&state, &id, &StoredKey { id: id.clone(), name: name.clone(), key_type: key_type.clone(), fingerprint: fingerprint.clone(), encrypted_key_data: key_data })?;
    Ok(KeyInfo { id, name, key_type, fingerprint })
}

#[tauri::command]
pub async fn import_key(name: String, key_data: String, state: State<'_, AppState>) -> AppResult<KeyInfo> {
    // Save the ORIGINAL key content directly without parsing/re-serializing
    let normalized_key = key_data.trim().to_string();
    
    // Decode to verify it's valid and get fingerprint
    let private_key = parse_private_key(&normalized_key).map_err(AppError::Key)?;
    let public_key = private_key.public_key();
    let fingerprint = public_key.fingerprint(Default::default()).to_string();
    
    let key_type = "ed25519".to_string();
    let id = format!("key_{}", uuid::Uuid::new_v4());
    
    // Save the ORIGINAL key content, not the re-serialized one
    save_key_to_db(&state, &id, &StoredKey { id: id.clone(), name: name.clone(), key_type: key_type.clone(), fingerprint: fingerprint.clone(), encrypted_key_data: normalized_key })?;
    Ok(KeyInfo { id, name, key_type, fingerprint })
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
    let key_type = "ed25519".to_string();
    
    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    
    let read_txn = db.begin_read().map_err(|e| AppError::Database(e.to_string()))?;
    let table = read_txn.open_table(KEYS_TABLE).map_err(|e| AppError::Database(e.to_string()))?;
    let value = table.get(id.as_str()).map_err(|e| AppError::Database(e.to_string()))?.ok_or_else(|| AppError::Key("Not found".to_string()))?;
    let stored_key: StoredKey = serde_json::from_str(value.value()).map_err(|e| AppError::Database(e.to_string()))?;
    
    let new_stored_key = StoredKey {
        id: stored_key.id,
        name,
        key_type,
        fingerprint,
        encrypted_key_data: normalized_key,
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
    let private_key = stored_key.encrypted_key_data.clone();
    let parsed = parse_private_key(&private_key).map_err(AppError::Key)?;
    let public_key = parsed.public_key().to_openssh().map_err(|e| AppError::Key(format!("Ser: {}", e)))?.to_string();
    Ok(KeyData { id: stored_key.id, name: stored_key.name, key_type: stored_key.key_type, fingerprint: stored_key.fingerprint, public_key, private_key })
}
