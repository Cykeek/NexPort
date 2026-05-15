use crate::error::{AppResult, AppError};

#[tauri::command]
pub async fn fetch_url(url: String) -> AppResult<String> {
    let response = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Key(format!("Failed to fetch URL: {}", e)))?;

    if !response.status().is_success() {
        return Err(AppError::Key(format!("HTTP {}", response.status())));
    }

    response
        .text()
        .await
        .map_err(|e| AppError::Key(format!("Failed to read response: {}", e)))
}

/// Returns the git commit hash that was embedded at compile time.
/// Used by the frontend to compare against the dev manifest hash.
#[tauri::command]
pub fn get_build_commit() -> String {
    env!("NEXPORT_BUILD_COMMIT").to_string()
}
