use aes_gcm::aead::generic_array::typenum::U32;
use aes_gcm::aead::generic_array::GenericArray;
use aes_gcm::{aead::Aead, aead::OsRng, AeadCore, Aes256Gcm, KeyInit};

pub struct Vault {
    cipher: Aes256Gcm,
}

impl Vault {
    pub fn new(master_key: &[u8; 32]) -> Self {
        let key = GenericArray::<u8, U32>::from_slice(master_key);
        Self {
            cipher: Aes256Gcm::new(key),
        }
    }

    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = self
            .cipher
            .encrypt(&nonce, plaintext)
            .map_err(|e| e.to_string())?;
        let mut result = nonce.to_vec();
        result.extend_from_slice(&ciphertext);
        Ok(result)
    }

    pub fn decrypt(&self, ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        if ciphertext.len() < 13 {
            return Err("Invalid ciphertext".into());
        }
        let (nonce_bytes, data) = ciphertext.split_at(12);
        let nonce = aes_gcm::Nonce::from_slice(nonce_bytes);
        self.cipher.decrypt(nonce, data).map_err(|e| e.to_string())
    }
}
