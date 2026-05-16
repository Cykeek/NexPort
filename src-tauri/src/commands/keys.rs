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
use base64::Engine;

const KEYS_TABLE: TableDefinition<&str, &str> = TableDefinition::new("keys");
const MAX_KEY_ID_LEN: usize = 128;
const MAX_KEY_NAME_LEN: usize = 128;
const MAX_PRIVATE_KEY_BYTES: usize = 64 * 1024;

fn has_control_chars(value: &str) -> bool {
    value.chars().any(|c| c.is_control())
}

fn validate_key_id(id: &str) -> AppResult<()> {
    if id.trim().is_empty() || id.len() > MAX_KEY_ID_LEN || has_control_chars(id) {
        return Err(AppError::InvalidInput("Invalid key ID".to_string()));
    }
    Ok(())
}

fn validate_key_name(name: &str) -> AppResult<()> {
    if name.trim().is_empty() || name.len() > MAX_KEY_NAME_LEN || has_control_chars(name) {
        return Err(AppError::InvalidInput("Invalid key name".to_string()));
    }
    Ok(())
}

fn validate_key_data_input(key_data: &str) -> AppResult<()> {
    if key_data.trim().is_empty() {
        return Err(AppError::InvalidInput("Key data cannot be empty".to_string()));
    }
    if key_data.as_bytes().len() > MAX_PRIVATE_KEY_BYTES {
        return Err(AppError::InvalidInput(
            "Key data exceeds allowed size".to_string(),
        ));
    }
    if key_data.contains('\0') {
        return Err(AppError::InvalidInput(
            "Key data contains invalid null byte".to_string(),
        ));
    }
    Ok(())
}

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
// (ed25519, RSA, ECDSA). Supports keys from various sources including
// those with non-standard line wrapping or compact formatting.
fn parse_private_key(raw: &str) -> Result<PrivateKey, String> {
    let normalized = raw.trim().replace("\r\n", "\n").replace("\r", "\n");
    if normalized.is_empty() {
        return Err("Empty key data".to_string());
    }

    // Re-wrap PEM base64 body to 70-char lines if needed
    let pem_ready = normalize_pem_wrapping(&normalized);

    // Try russh_keys directly first
    match PrivateKey::from_openssh(pem_ready.as_bytes()) {
        Ok(key) => return Ok(key),
        Err(e) => {
            log::debug!("[key-import] russh_keys direct parse failed: {}", e);
        }
    }

    // Try ssh_key crate
    match SshPrivateKey::from_openssh(&pem_ready) {
        Ok(ssh_privkey) => {
            let openssh = ssh_privkey.to_openssh(LineEnding::LF)
                .map_err(|e| format!("Failed to serialize key: {}", e))?;
            return PrivateKey::from_openssh(openssh.as_bytes())
                .map_err(|e| format!("Failed to load key into SSH library: {}", e));
        }
        Err(e) => {
            log::debug!("[key-import] ssh_key crate also failed: {}", e);
        }
    }

    // Both parsers failed — likely non-standard padding. Fix and retry.
    log::info!("[key-import] Attempting padding fix...");
    let fixed_pem = fix_openssh_padding(&pem_ready)?;

    PrivateKey::from_openssh(fixed_pem.as_bytes())
        .map_err(|e| {
            log::error!("[key-import] All parse attempts failed: {}", e);
            "Failed to parse key. Please ensure the key is a valid OpenSSH private key.".to_string()
        })
}

/// Fix OpenSSH private key padding that exceeds blocksize-1.
/// Some generators pad to the next block boundary with more bytes than
/// strict parsers expect. This function trims padding to exactly what's needed.
fn fix_openssh_padding(pem: &str) -> Result<String, String> {
    // Extract base64 body
    let lines: Vec<&str> = pem.lines().collect();
    if lines.len() < 3 {
        return Err("Invalid PEM structure".to_string());
    }
    let header = lines[0];
    let footer = lines[lines.len() - 1];
    let body: String = lines[1..lines.len() - 1].concat();

    let mut data = base64::engine::general_purpose::STANDARD.decode(&body)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    // Verify magic
    if data.len() < 15 || &data[0..15] != b"openssh-key-v1\0" {
        return Err("Not a valid OpenSSH key".to_string());
    }

    let mut o: usize = 15;

    // Helper to read u32 BE
    fn read_u32(data: &[u8], offset: usize) -> Result<(u32, usize), String> {
        if offset + 4 > data.len() {
            return Err("Unexpected end of key data".to_string());
        }
        let val = u32::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]);
        Ok((val, offset + 4))
    }

    // Skip string (read len, skip len bytes)
    fn skip_str(data: &[u8], offset: usize) -> Result<usize, String> {
        let (len, next) = read_u32(data, offset)?;
        let end = next + len as usize;
        if end > data.len() {
            return Err("String extends beyond key data".to_string());
        }
        Ok(end)
    }

    // Skip cipher, kdf, kdf_options
    o = skip_str(&data, o)?;
    o = skip_str(&data, o)?;
    o = skip_str(&data, o)?;

    // nkeys
    let (nkeys, next) = read_u32(&data, o)?;
    o = next;
    if nkeys != 1 {
        return Err(format!("Expected 1 key, found {}", nkeys));
    }

    // Skip public key blob
    o = skip_str(&data, o)?;

    // Private section length
    let (priv_len, priv_start) = read_u32(&data, o)?;
    let priv_section_start = priv_start;
    let priv_section_end = priv_start + priv_len as usize;

    if priv_section_end > data.len() {
        return Err("Private section extends beyond key data".to_string());
    }

    // Parse inside private section to find where content ends and padding begins
    let mut p = priv_section_start;

    // checkint1, checkint2
    let (_, next) = read_u32(&data, p)?; p = next;
    let (_, next) = read_u32(&data, p)?; p = next;

    // key type string
    p = skip_str(&data, p)?;
    // public key
    p = skip_str(&data, p)?;
    // private key (for ed25519 this is 64 bytes as a string)
    p = skip_str(&data, p)?;
    // comment
    p = skip_str(&data, p)?;

    let content_len = p - priv_section_start;
    let block_size: usize = 8; // "none" cipher uses block size 8
    let padded_len = ((content_len + block_size - 1) / block_size) * block_size;
    let correct_padding = padded_len - content_len;

    log::info!("[key-import] Content: {} bytes, needs {} padding bytes (was {})",
        content_len, correct_padding, priv_len as usize - content_len);

    // Rebuild with correct padding
    let new_priv_len = (content_len + correct_padding) as u32;

    // Write new private section length
    let len_offset = priv_section_start - 4;
    data[len_offset] = (new_priv_len >> 24) as u8;
    data[len_offset + 1] = (new_priv_len >> 16) as u8;
    data[len_offset + 2] = (new_priv_len >> 8) as u8;
    data[len_offset + 3] = new_priv_len as u8;

    // Write correct padding bytes (1, 2, 3, ...)
    let new_end = priv_section_start + content_len + correct_padding;
    for i in 0..correct_padding {
        if priv_section_start + content_len + i < data.len() {
            data[priv_section_start + content_len + i] = (i + 1) as u8;
        }
    }

    // Truncate data to new end
    data.truncate(new_end);

    // Re-encode to PEM
    let encoded = base64::engine::general_purpose::STANDARD.encode(&data);
    let mut result = String::with_capacity(encoded.len() + 80);
    result.push_str(header);
    result.push('\n');
    for chunk in encoded.as_bytes().chunks(70) {
        result.push_str(std::str::from_utf8(chunk).unwrap_or(""));
        result.push('\n');
    }
    result.push_str(footer);

    Ok(result)
}

/// Re-wraps PEM base64 body to 70-char lines if it's not already wrapped.
/// Some tools or copy-paste operations produce keys with the entire base64
/// payload on a single line, which the ssh_key crate rejects.
fn normalize_pem_wrapping(pem: &str) -> String {
    let lines: Vec<&str> = pem.lines().collect();
    
    // Need at least header + body + footer
    if lines.len() < 3 {
        return pem.to_string();
    }

    let header = lines[0];
    let footer = lines[lines.len() - 1];

    // Check if it looks like a PEM structure
    if !header.starts_with("-----BEGIN ") || !footer.starts_with("-----END ") {
        return pem.to_string();
    }

    // Extract the base64 body (everything between header and footer)
    let body_lines = &lines[1..lines.len() - 1];
    
    // If any body line exceeds 76 chars, it needs re-wrapping
    let needs_rewrap = body_lines.iter().any(|line| line.len() > 76);
    
    if !needs_rewrap {
        return pem.to_string();
    }

    log::info!("[key-import] Re-wrapping base64 body to 70-char lines");

    // Concatenate all body lines and re-wrap at 70 chars
    let body: String = body_lines.concat();
    let mut result = String::with_capacity(pem.len() + body.len() / 70);
    result.push_str(header);
    result.push('\n');

    for chunk in body.as_bytes().chunks(70) {
        result.push_str(std::str::from_utf8(chunk).unwrap_or(""));
        result.push('\n');
    }

    result.push_str(footer);
    result
}

#[tauri::command]
pub async fn generate_key(name: String, key_type: String, _passphrase: Option<String>, state: State<'_, AppState>) -> AppResult<KeyInfo> {
    validate_key_name(&name)?;

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
    validate_key_name(&name)?;
    validate_key_data_input(&key_data)?;

    let mut normalized_key = key_data.trim().to_string();
    
    // Decode to verify it's valid and get fingerprint
    let private_key = match parse_private_key(&normalized_key) {
        Ok(key) => key,
        Err(err) => {
            normalized_key.zeroize();
            return Err(AppError::Key(err));
        }
    };
    let public_key = private_key.public_key();
    let fingerprint = public_key.fingerprint(Default::default()).to_string();
    
    // Detect actual key type
    let key_type = match public_key.algorithm() {
        ssh_key::Algorithm::Ed25519 => "ed25519",
        ssh_key::Algorithm::Rsa { .. } => "rsa",
        ssh_key::Algorithm::Ecdsa { .. } => "ecdsa",
        _ => "unknown",
    };
    
    log::info!("[key-import] Imported {} key: {}", key_type, name);
    
    // Encrypt the private key before storing
    let encrypted_key_data = encrypt_key_data(&state.vault, &normalized_key)?;
    normalized_key.zeroize();
    
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
    validate_key_id(&id)?;

    let db_guard = state.get_db().map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref().ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;
    
    let write_txn = db.begin_write().map_err(|e| AppError::Database(e.to_string()))?;
    { let mut t = write_txn.open_table(KEYS_TABLE).map_err(|e| AppError::Database(e.to_string()))?; t.remove(id.as_str()).map_err(|e| AppError::Database(e.to_string()))?; }
    write_txn.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn update_key(id: String, name: String, state: State<'_, AppState>) -> AppResult<()> {
    validate_key_id(&id)?;
    validate_key_name(&name)?;

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
    validate_key_id(&id)?;
    validate_key_name(&name)?;
    validate_key_data_input(&key_data)?;

    let mut normalized_key = key_data.trim().to_string();
    let private_key = match parse_private_key(&normalized_key) {
        Ok(key) => key,
        Err(err) => {
            normalized_key.zeroize();
            return Err(AppError::Key(err));
        }
    };
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
    normalized_key.zeroize();
    
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
    validate_key_id(&id)?;

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
