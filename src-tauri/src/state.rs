use crate::ssh::session::SshSession;
use crate::vault::encryptor::Vault;
use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
use dashmap::DashMap;
use rand::RngCore;
use redb::{Database, TableDefinition};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use tokio::sync::Mutex as TokioMutex;

const CONNECTIONS_TABLE: TableDefinition<&str, &str> = TableDefinition::new("connections");
const KEYS_TABLE: TableDefinition<&str, &str> = TableDefinition::new("keys");
const SALT_FILENAME: &str = "master_salt";

pub struct AppState {
    pub sessions: DashMap<String, Arc<TokioMutex<SshSession>>>,
    pub db: Mutex<Option<Database>>,
    #[allow(dead_code)]
    pub vault: Arc<Mutex<Vault>>,
    db_path: PathBuf,
    data_dir: PathBuf,
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
    /// Create an empty state (for fresh install - no database yet)
    pub fn new_empty(db_path: PathBuf, data_dir: PathBuf) -> Self {
        Self {
            sessions: DashMap::new(),
            db: Mutex::new(None),
            vault: Arc::new(Mutex::new(Vault::new(&[0u8; 32]))), // Placeholder key, will be replaced on init
            db_path,
            data_dir,
        }
    }

    /// Initialize database on first use (lazy initialization)
    pub fn ensure_database(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Check if database already initialized
        {
            let db_guard = self.db.lock().map_err(|e| e.to_string())?;
            if db_guard.is_some() {
                return Ok(()); // Already initialized
            }
        }

        // Ensure parent directory exists
        if let Some(parent) = self.db_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Open or create database
        let db = Database::open(&self.db_path)?;

        // Create tables if new database
        {
            let write_txn = db.begin_write()?;
            let _ = write_txn.open_table(CONNECTIONS_TABLE);
            let _ = write_txn.open_table(KEYS_TABLE);
            write_txn.commit()?;
        }

        // Initialize vault with master key
        let salt_path = self.data_dir.join(SALT_FILENAME);
        let master_key = derive_master_key(&salt_path)?;
        let vault = Vault::new(&master_key);

        // Store the database
        let mut db_guard = self.db.lock().map_err(|e| e.to_string())?;
        *db_guard = Some(db);

        // Update vault (need to replace the placeholder)
        let mut vault_guard = self.vault.lock().map_err(|e| e.to_string())?;
        *vault_guard = vault;

        Ok(())
    }

    /// Get database, initializing if needed
    pub fn get_db(
        &self,
    ) -> Result<std::sync::MutexGuard<Option<Database>>, Box<dyn std::error::Error>> {
        self.ensure_database()?;
        Ok(self.db.lock().map_err(|e| e.to_string())?)
    }
}
