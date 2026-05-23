use crate::crypto::{decrypt_field, decrypt_key_data};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use reqwest::{redirect::Policy, Client, Url};
use sysinfo::Networks;
use std::time::Duration;
use tauri::State;

pub const CONNECTIONS_TABLE: redb::TableDefinition<&str, &str> = redb::TableDefinition::new("connections");
pub const KEYS_TABLE: redb::TableDefinition<&str, &str> = redb::TableDefinition::new("keys");

pub fn has_control_chars(input: &str) -> bool {
    input.chars().any(|c| c.is_control())
}

pub fn validate_identifier(value: &str, field: &str, max_len: usize) -> AppResult<()> {
    if value.trim().is_empty() || value.len() > max_len || has_control_chars(value) {
        return Err(AppError::InvalidInput(format!("Invalid {}", field)));
    }
    Ok(())
}

pub struct ConnectionCredentials {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub key_data: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredKey {
    #[allow(dead_code)]
    pub id: String,
    #[allow(dead_code)]
    pub name: String,
    #[allow(dead_code)]
    pub key_type: String,
    #[allow(dead_code)]
    pub fingerprint: String,
    pub encrypted_key_data: String,
}

pub fn load_connection_credentials(
    state: &State<'_, AppState>,
    connection_id: &str,
    max_connection_id_len: usize,
) -> AppResult<ConnectionCredentials> {
    validate_identifier(connection_id, "connection ID", max_connection_id_len)?;

    let db_guard = state.get_db()
        .map_err(|e| AppError::Database(e.to_string()))?;
    let db = db_guard.as_ref()
        .ok_or_else(|| AppError::Database("Database not initialized".to_string()))?;

    let read_txn = db.begin_read()
        .map_err(|e| AppError::Database(e.to_string()))?;
    let connections_table = read_txn.open_table(CONNECTIONS_TABLE)
        .map_err(|e| AppError::Database(e.to_string()))?;

    let value = connections_table.get(connection_id)
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::Database("Connection not found".to_string()))?;

    let profile: crate::commands::connections::ConnectionProfile = serde_json::from_str(value.value())
        .map_err(|e| AppError::Database(e.to_string()))?;

    let password = if let Some(ref encrypted) = profile.encrypted_password {
        if !encrypted.is_empty() {
            Some(decrypt_field(&state.vault, encrypted)
                .map_err(|e| AppError::Vault(format!("Failed to decrypt password: {}", e)))?)
        } else {
            None
        }
    } else {
        None
    };

    let key_data = if let Some(ref key_id) = profile.key_id {
        let keys_table = read_txn.open_table(KEYS_TABLE)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let key_value = keys_table.get(key_id.as_str())
            .map_err(|e| AppError::Database(e.to_string()))?
            .ok_or_else(|| AppError::Database("Key not found".to_string()))?;

        let stored_key: StoredKey = serde_json::from_str(key_value.value())
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut decrypted = decrypt_key_data(&state.vault, &stored_key.encrypted_key_data)
            .map_err(|e| AppError::Vault(format!("Failed to decrypt SSH key: {}", e)))?;

        if !decrypted.ends_with('\n') {
            decrypted.push('\n');
        }
        Some(decrypted)
    } else {
        None
    };

    Ok(ConnectionCredentials {
        host: profile.host,
        port: profile.port,
        username: profile.username,
        password,
        key_data,
    })
}

const STABLE_MANIFEST_URL: &str =
    "https://github.com/Cykeek/NexPort/releases/latest/download/latest.json";
const DEV_MANIFEST_URL: &str =
    "https://github.com/Cykeek/NexPort/releases/download/dev-latest/latest.json";
const MAX_FETCH_BODY_BYTES: usize = 1024 * 1024; // 1 MiB safety cap

fn is_allowed_manifest_input(url: &Url) -> bool {
    matches!(url.as_str(), STABLE_MANIFEST_URL | DEV_MANIFEST_URL)
}

fn is_allowed_redirect_host(host: &str) -> bool {
    matches!(
        host,
        "github.com" | "release-assets.githubusercontent.com" | "objects.githubusercontent.com"
    )
}

#[tauri::command]
pub async fn fetch_url(url: String) -> AppResult<String> {
    let parsed = Url::parse(&url)
        .map_err(|_| AppError::InvalidInput("Invalid URL".to_string()))?;

    if parsed.scheme() != "https" {
        return Err(AppError::InvalidInput(
            "Only HTTPS URLs are allowed".to_string(),
        ));
    }

    if !is_allowed_manifest_input(&parsed) {
        return Err(AppError::InvalidInput(
            "URL is not an approved update manifest endpoint".to_string(),
        ));
    }

    let client = Client::builder()
        .https_only(true)
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 3 {
                return attempt.error("Too many redirects");
            }

            let next = attempt.url();
            if next.scheme() != "https" {
                return attempt.error("Insecure redirect blocked");
            }

            match next.host_str() {
                Some(host) if is_allowed_redirect_host(host) => attempt.follow(),
                _ => attempt.error("Redirect host not allowed"),
            }
        }))
        .build()
        .map_err(|e| AppError::Key(format!("Failed to create HTTP client: {}", e)))?;

    let response = client
        .get(parsed)
        .send()
        .await
        .map_err(|e| AppError::Key(format!("Failed to fetch URL: {}", e)))?;

    if !response.status().is_success() {
        return Err(AppError::Key(format!("HTTP {}", response.status())));
    }

    let response_host = response.url().host_str().ok_or_else(|| {
        AppError::Key("Response URL did not contain a valid host".to_string())
    })?;
    if !is_allowed_redirect_host(response_host) {
        return Err(AppError::Key(
            "Response host is not allowed for update manifests".to_string(),
        ));
    }

    if let Some(content_len) = response.content_length() {
        if content_len > MAX_FETCH_BODY_BYTES as u64 {
            return Err(AppError::Key(
                "Response too large for update manifest".to_string(),
            ));
        }
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::Key(format!("Failed to read response: {}", e)))?;

    if bytes.len() > MAX_FETCH_BODY_BYTES {
        return Err(AppError::Key(
            "Response exceeded update manifest size limit".to_string(),
        ));
    }

    String::from_utf8(bytes.to_vec())
        .map_err(|_| AppError::Key("Manifest response was not valid UTF-8".to_string()))
}

/// Returns the git commit hash that was embedded at compile time.
/// Used by the frontend to compare against the dev manifest hash.
#[tauri::command]
pub fn get_build_commit() -> String {
    env!("NEXPORT_BUILD_COMMIT").to_string()
}

#[derive(serde::Serialize)]
pub struct NetworkCounters {
    pub rx_bytes_total: u64,
    pub tx_bytes_total: u64,
    pub interface_count: usize,
}

/// Returns cumulative RX/TX byte counters across non-loopback interfaces.
/// The frontend computes rates from counter deltas to render the status bar meter.
#[tauri::command]
pub async fn get_network_counters() -> AppResult<NetworkCounters> {
    tokio::task::spawn_blocking(|| {
        let networks = Networks::new_with_refreshed_list();

        let mut rx_bytes_total: u64 = 0;
        let mut tx_bytes_total: u64 = 0;
        let mut interface_count: usize = 0;

        for (name, data) in &networks {
            let n = name.to_ascii_lowercase();
            if n == "lo" || n == "lo0" || n.contains("loopback") {
                continue;
            }

            interface_count += 1;
            rx_bytes_total = rx_bytes_total.saturating_add(data.total_received());
            tx_bytes_total = tx_bytes_total.saturating_add(data.total_transmitted());
        }

        NetworkCounters {
            rx_bytes_total,
            tx_bytes_total,
            interface_count,
        }
    })
    .await
    .map_err(|e| AppError::Key(format!("Network counters task failed: {}", e)))
}
