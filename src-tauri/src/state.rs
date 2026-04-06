use crate::ssh::session::SshSession;
use crate::vault::encryptor::Vault;
use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
use dashmap::DashMap;
use rand::RngCore;
use redb::{Database, TableDefinition};
use std::fs;
use std::sync::Arc;
use std::sync::Mutex;
use tokio::sync::Mutex as TokioMutex;

const CONNECTIONS_TABLE: TableDefinition<&str, &str> = TableDefinition::new("connections");
const KEYS_TABLE: TableDefinition<&str, &str> = TableDefinition::new("keys");
const SALT_FILENAME: &str = "master_salt";

pub struct AppState {
    pub sessions: DashMap<String, Arc<TokioMutex<SshSession>>>,
    pub db: Mutex<Database>,
    #[allow(dead_code)]
    pub vault: Arc<Mutex<Vault>>,
}

fn derive_master_key(salt_path: &std::path::Path) -> Result<[u8; 32], Box<dyn std::error::Error>> {
    let salt = if salt_path.exists() {
        let data = fs::read(salt_path)?;
        SaltString::from_b64(std::str::from_utf8(&data)?).map_err(|e| e.to_string())?
    } else {
        let mut rng = rand::thread_rng();
        let mut salt_bytes = [0u8; 16];
        rng.fill_bytes(&mut salt_bytes);
        let salt = SaltString::encode_b64(&salt_bytes).map_err(|e| e.to_string())?;
        fs::write(salt_path, salt.as_str())?;
        salt
    };

    let hostname = hostname::get().unwrap_or_default();
    let hostname_str = hostname.to_string_lossy();

    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(hostname_str.as_bytes(), &salt)
        .map_err(|e| e.to_string())?;

    let hash = password_hash.hash.unwrap();
    let hash_bytes = hash.as_bytes();
    let mut key = [0u8; 32];
    key.copy_from_slice(&hash_bytes[..32]);
    Ok(key)
}

impl AppState {
    pub fn new(
        db_path: &std::path::Path,
        data_dir: &std::path::Path,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let db = Database::open(db_path)?;
        {
            let write_txn = db.begin_write()?;
            write_txn.open_table(CONNECTIONS_TABLE)?;
            write_txn.open_table(KEYS_TABLE)?;
            write_txn.commit()?;
        }

        let salt_path = data_dir.join(SALT_FILENAME);
        let master_key = derive_master_key(&salt_path)?;
        let vault = Vault::new(&master_key);

        Ok(Self {
            sessions: DashMap::new(),
            db: Mutex::new(db),
            vault: Arc::new(Mutex::new(vault)),
        })
    }
}
