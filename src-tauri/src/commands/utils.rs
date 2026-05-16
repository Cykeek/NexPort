use crate::error::{AppError, AppResult};
use reqwest::{redirect::Policy, Client, Url};
use sysinfo::Networks;
use std::time::Duration;

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
