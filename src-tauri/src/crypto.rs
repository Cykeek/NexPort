use crate::error::AppError;
use crate::vault::encryptor::Vault;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::sync::Mutex;

#[allow(dead_code)]
pub fn encrypt_field(vault: &Mutex<Vault>, plaintext: &str) -> Result<String, AppError> {
    let vault = vault
        .lock()
        .map_err(|e| AppError::Database(e.to_string()))?;
    let encrypted = vault
        .encrypt(plaintext.as_bytes())
        .map_err(|e| AppError::Database(e))?;
    Ok(STANDARD.encode(&encrypted))
}

#[allow(dead_code)]
pub fn decrypt_field(vault: &Mutex<Vault>, encrypted_b64: &str) -> Result<String, AppError> {
    let encrypted = STANDARD
        .decode(encrypted_b64)
        .map_err(|e| AppError::Database(e.to_string()))?;
    let vault = vault
        .lock()
        .map_err(|e| AppError::Database(e.to_string()))?;
    let decrypted = vault
        .decrypt(&encrypted)
        .map_err(|e| AppError::Database(e))?;
    String::from_utf8(decrypted).map_err(|e| AppError::Database(e.to_string()))
}