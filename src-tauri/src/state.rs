use crate::ssh::session::SshSession;
use crate::commands::sftp::SftpConnection;
use crate::diskio::{DiskSpeedCache, ThroughputSampler};
use crate::vault::encryptor::Vault;
use crate::commands::utils::{CONNECTIONS_TABLE, KEYS_TABLE};
use dashmap::DashMap;
use rand::RngCore;
use redb::{Database, ReadableTable, TableDefinition};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::sync::Mutex;
use tokio::sync::Mutex as TokioMutex;

const MASTER_KEY_FILENAME: &str = "master_key";
const OLD_SALT_FILENAME: &str = "master_salt";
const SCHEMA_TABLE: TableDefinition<&str, u64> = TableDefinition::new("schema_version");
const CURRENT_SCHEMA_VERSION: u64 = 2;

pub struct AppState {
    pub sessions: DashMap<String, Arc<TokioMutex<SshSession>>>,
    pub sftp_sessions: DashMap<String, Arc<TokioMutex<SftpConnection>>>,
    pub sftp_upload_cancellation: DashMap<String, Arc<AtomicBool>>,
    pub sftp_download_cancellation: DashMap<String, Arc<AtomicBool>>,
    pub sftp_delete_cancellation: DashMap<String, Arc<AtomicBool>>,
    pub db: Mutex<Option<Database>>,
    pub vault: Arc<Mutex<Vault>>,
    pub disk_io_sampler: Mutex<ThroughputSampler>,
    pub disk_speed_cache: Mutex<DiskSpeedCache>,
    db_path: PathBuf,
}

/// Load an existing random master key, or generate and persist a new one.
/// If an old hostname-derived key exists (master_salt), it migrates all encrypted
/// data to the new random key before deleting the old salt file.
fn load_or_generate_master_key(
    key_path: &std::path::Path,
    db_path: &std::path::Path,
) -> Result<[u8; 32], Box<dyn std::error::Error>> {
    // Check if old salt-based key still exists — migration may be needed.
    let salt_path = key_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join(OLD_SALT_FILENAME);

    let migration_needed = salt_path.exists();

    // If new key already exists, try to load it.
    if key_path.exists() && !migration_needed {
        // No migration needed — just load the existing key.
        let hex_data = fs::read_to_string(key_path)?;
        let hex_str = hex_data.trim();
        let bytes = hex::decode(hex_str)?;
        return bytes
            .try_into()
            .map_err(|_| "Invalid master key length".into());
    }

    let old_key = if migration_needed {
        Some(derive_master_key_from_salt(&salt_path)?)
    } else {
        None
    };

    // Generate the new random key (or regenerate if migration needed).
    let mut rng = rand::thread_rng();
    let mut new_key = [0u8; 32];
    rng.fill_bytes(&mut new_key);

    // If we're migrating, re-encrypt all existing data.
    if let Some(old_key) = old_key {
        if let Err(e) = migrate_encrypted_data(db_path, &old_key, &new_key) {
            log::warn!("Failed to migrate encrypted data: {}", e);
            log::warn!("Previously encrypted passwords/keys may need to be re-entered.");
        } else {
            fs::remove_file(&salt_path).ok();
            log::info!("Migrated encrypted data to new random master key.");
        }
    }

    // Persist new key to disk
    if let Some(parent) = key_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::write(key_path, hex::encode(&new_key))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(key_path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o600);
            fs::set_permissions(key_path, perms).ok();
        }
    }

    Ok(new_key)
}

/// Derive the old hostname-based master key from the salt file.
fn derive_master_key_from_salt(salt_path: &std::path::Path) -> Result<[u8; 32], Box<dyn std::error::Error>> {
    use argon2::{password_hash::SaltString, Argon2, PasswordHasher};

    let data = fs::read(salt_path)?;
    let salt = SaltString::from_b64(std::str::from_utf8(&data)?).map_err(|e| e.to_string())?;
    let hostname = hostname::get().unwrap_or_default();
    let hostname_str = hostname.to_string_lossy();
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(hostname_str.as_bytes(), &salt)
        .map_err(|e| e.to_string())?;
    let hash = password_hash.hash.ok_or_else(|| "Argon2 output missing hash field".to_string())?;
    let hash_bytes = hash.as_bytes();
    if hash_bytes.len() < 32 {
        return Err("Argon2 hash too short for key derivation".into());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&hash_bytes[..32]);
    Ok(key)
}

/// Re-encrypt all connection passwords and key data from old_key to new_key.
fn migrate_encrypted_data(
    db_path: &std::path::Path,
    old_key: &[u8; 32],
    new_key: &[u8; 32],
) -> Result<(), String> {
    use crate::vault::encryptor::Vault;

    if !db_path.exists() {
        return Ok(());
    }

    let db = Database::open(db_path).map_err(|e| e.to_string())?;
    let old_vault = Vault::new(old_key);
    let new_vault = Vault::new(new_key);

    // Migrate connection passwords
    {
        let read_txn = db.begin_read().map_err(|e| e.to_string())?;
        let table = read_txn
            .open_table(CONNECTIONS_TABLE)
            .map_err(|e| e.to_string())?;

        let mut updates: Vec<(String, String)> = Vec::new();
        for row in table.iter().map_err(|e| e.to_string())? {
            let (key, value) = row.map_err(|e| e.to_string())?;
            let key_str = key.value().to_string();
            let value_str = value.value().to_string();

            if let Ok(mut profile) = serde_json::from_str::<ConnectionProfileMigrate>(&value_str) {
                if let Some(ref enc) = profile.encrypted_password {
                    if let Ok(decrypted) = decrypt_with_vault(&old_vault, enc) {
                        let reencrypted = encrypt_with_vault(&new_vault, &decrypted);
                        profile.encrypted_password = Some(reencrypted);
                        let new_json = serde_json::to_string(&profile).map_err(|e| e.to_string())?;
                        updates.push((key_str, new_json));
                    }
                }
            }
        }
        drop(read_txn);

        if !updates.is_empty() {
            let write_txn = db.begin_write().map_err(|e| e.to_string())?;
            {
                let mut table = write_txn
                    .open_table(CONNECTIONS_TABLE)
                    .map_err(|e| e.to_string())?;
                for (k, v) in updates {
                    table
                        .insert(k.as_str(), v.as_str())
                        .map_err(|e| e.to_string())?;
                }
            }
            write_txn.commit().map_err(|e| e.to_string())?;
        }
    }

    // Migrate SSH key data
    {
        let read_txn = db.begin_read().map_err(|e| e.to_string())?;
        let table = read_txn
            .open_table(KEYS_TABLE)
            .map_err(|e| e.to_string())?;

        let mut updates: Vec<(String, String)> = Vec::new();
        for row in table.iter().map_err(|e| e.to_string())? {
            let (key, value) = row.map_err(|e| e.to_string())?;
            let key_str = key.value().to_string();
            let value_str = value.value().to_string();

            if let Ok(mut stored_key) = serde_json::from_str::<StoredKeyMigrate>(&value_str) {
                if let Ok(decrypted) = decrypt_with_vault(&old_vault, &stored_key.encrypted_key_data) {
                    let reencrypted = encrypt_with_vault(&new_vault, &decrypted);
                    stored_key.encrypted_key_data = reencrypted;
                    let new_json = serde_json::to_string(&stored_key).map_err(|e| e.to_string())?;
                    updates.push((key_str, new_json));
                }
            }
        }
        drop(read_txn);

        if !updates.is_empty() {
            let write_txn = db.begin_write().map_err(|e| e.to_string())?;
            {
                let mut table = write_txn
                    .open_table(KEYS_TABLE)
                    .map_err(|e| e.to_string())?;
                for (k, v) in updates {
                    table
                        .insert(k.as_str(), v.as_str())
                        .map_err(|e| e.to_string())?;
                }
            }
            write_txn.commit().map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn encrypt_with_vault(vault: &Vault, plaintext: &str) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let encrypted = vault.encrypt(plaintext.as_bytes())
        .unwrap_or_else(|e| {
            log::error!("Vault encryption failed: {}", e);
            Vec::new()
        });
    STANDARD.encode(&encrypted)
}

fn decrypt_with_vault(vault: &Vault, encrypted_b64: &str) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let encrypted = STANDARD.decode(encrypted_b64).map_err(|e| e.to_string())?;
    let decrypted = vault.decrypt(&encrypted).map_err(|e| e.to_string())?;
    String::from_utf8(decrypted).map_err(|e| e.to_string())
}

/// Minimal profile struct for migration — only needs encrypted_password.
#[derive(serde::Deserialize, serde::Serialize)]
struct ConnectionProfileMigrate {
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
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub detected_os: Option<String>,
    #[serde(default)]
    pub has_password: bool,
}

/// Minimal key struct for migration — only needs encrypted_key_data.
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredKeyMigrate {
    pub id: String,
    pub name: String,
    pub key_type: String,
    pub fingerprint: String,
    pub encrypted_key_data: String,
}

/// Read the current schema version from the database, or 0 if not set.
fn get_schema_version(db: &Database) -> Result<u64, Box<dyn std::error::Error>> {
    let read_txn = db.begin_read()?;
    match read_txn.open_table(SCHEMA_TABLE) {
        Ok(table) => {
            if let Some(guard) = table.get("version")? {
                return Ok(guard.value());
            }
        }
        Err(_) => return Ok(0),
    }
    Ok(0)
}

/// Write the schema version.
fn set_schema_version(db: &Database, version: u64) -> Result<(), Box<dyn std::error::Error>> {
    let write_txn = db.begin_write()?;
    {
        let mut table = write_txn.open_table(SCHEMA_TABLE)?;
        table.insert("version", version)?;
    }
    write_txn.commit()?;
    Ok(())
}

/// Run schema migrations sequentially from the current version to CURRENT_SCHEMA_VERSION.
fn run_schema_migrations(db: &Database) -> Result<(), Box<dyn std::error::Error>> {
    let current = get_schema_version(db)?;
    if current >= CURRENT_SCHEMA_VERSION {
        return Ok(());
    }

    log::info!("Migrating database schema from v{} to v{}", current, CURRENT_SCHEMA_VERSION);

    // v0 → v1: initial schema tracking
    if current < 1 {
        set_schema_version(db, 1)?;
    }

    // v1 → v2: added has_password field (derived at read time — no data change needed)
    if current < 2 {
        set_schema_version(db, 2)?;
    }

    log::info!("Schema migration complete.");
    Ok(())
}

impl AppState {
    pub fn new(db_path: PathBuf) -> Self {
        // Load or generate the master key eagerly so the app fails fast if something is wrong.
        // Also migrates old data from hostname-derived key if present.
        let key_path = db_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join(MASTER_KEY_FILENAME);
        let master_key = load_or_generate_master_key(&key_path, &db_path)
            .expect("Failed to load or generate master key — app cannot start securely");

        let disk_io_sampler = match ThroughputSampler::new() {
            Ok(s) => Mutex::new(s),
            Err(e) => {
                log::warn!("Failed to initialize disk I/O sampler: {}", e);
                // Create a dummy sampler that always returns empty results.
                // This allows the app to function on unsupported platforms.
                let dummy: Box<dyn crate::diskio::DiskIoProvider> =
                    Box::new(crate::diskio::DummyProvider::new());
                let dummy_sampler = crate::diskio::ThroughputSampler::with_provider(dummy);
                Mutex::new(dummy_sampler)
            }
        };

        Self {
            sessions: DashMap::new(),
            sftp_sessions: DashMap::new(),
            sftp_upload_cancellation: DashMap::new(),
            sftp_download_cancellation: DashMap::new(),
            sftp_delete_cancellation: DashMap::new(),
            db: Mutex::new(None),
            vault: Arc::new(Mutex::new(Vault::new(&master_key))),
            disk_io_sampler,
            disk_speed_cache: Mutex::new(DiskSpeedCache::new()),
            db_path,
        }
    }

    pub fn get_disk_speed(&self) -> Option<f64> {
        let mut cache = self.disk_speed_cache.lock().ok()?;
        let mut sampler = self.disk_io_sampler.lock().ok()?;
        cache.get(&mut sampler)
    }

    pub fn ensure_database(&self) -> Result<(), Box<dyn std::error::Error>> {
        {
            let db_guard = self.db.lock().map_err(|e| e.to_string())?;
            if db_guard.is_some() {
                return Ok(());
            }
        }

        if let Some(parent) = self.db_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }

        let wal_path = self.db_path.with_extension("redb.wal");
        let shm_path = self.db_path.with_extension("redb.shm");
        wal_path.exists().then(|| fs::remove_file(&wal_path).ok());
        shm_path.exists().then(|| fs::remove_file(&shm_path).ok());

        let db = Database::create(&self.db_path).or_else(|_| Database::open(&self.db_path))?;

        // Ensure tables exist and run schema migrations.
        {
            let write_txn = db.begin_write()?;
            let _ = write_txn.open_table(CONNECTIONS_TABLE);
            let _ = write_txn.open_table(KEYS_TABLE);
            let _ = write_txn.open_table(SCHEMA_TABLE);
            write_txn.commit()?;
        }

        // Run migrations if needed.
        run_schema_migrations(&db)?;

        let mut db_guard = self.db.lock().map_err(|e| e.to_string())?;
        *db_guard = Some(db);

        // Vault is already initialized with the master key — no need to re-derive here.

        Ok(())
    }

    pub fn get_db(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, Option<Database>>, Box<dyn std::error::Error>> {
        self.ensure_database()?;
        Ok(self.db.lock().map_err(|e| e.to_string())?)
    }
}
