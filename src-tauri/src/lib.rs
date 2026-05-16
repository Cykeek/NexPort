mod commands;
mod crypto;
mod error;
mod ssh;
mod state;
mod vault;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Use Tauri's built-in logging via tauri-plugin-log.
    // We intentionally do NOT write panic logs to disk — crash dumps can
    // contain sensitive data (passwords, keys, hostnames) and should not
    // be persisted in plaintext. Panics are reported to stderr and captured
    // by the OS crash reporter instead.

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Get app data directory
            let data_dir = match app.path().app_data_dir() {
                Ok(d) => d,
                Err(e) => {
                    log::error!("Failed to get app data directory: {}", e);
                    return Err(e.into());
                }
            };

            // Create data directory if it doesn't exist
            if let Err(e) = std::fs::create_dir_all(&data_dir) {
                log::error!("Failed to create app data directory: {}", e);
            }

            let db_path = data_dir.join("connections.redb");
            let app_state = AppState::new(db_path);

            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ssh::ssh_connect,
            commands::ssh::ssh_disconnect,
            commands::ssh::ssh_is_connected,
            commands::ssh::ssh_resize,
            commands::ssh::ssh_write,
            commands::ssh::ssh_read,
            commands::ssh::ssh_detect_os,
            commands::ssh::list_known_hosts,
            commands::connections::save_connection,
            commands::connections::get_connections,
            commands::connections::delete_connection,
            commands::connections::check_host_status,
            commands::connections::update_connection_os,
            commands::connections::record_connection_session,
            commands::connections::update_connection_tags,
            commands::keys::generate_key,
            commands::keys::import_key,
            commands::keys::list_keys,
            commands::keys::delete_key,
            commands::keys::update_key,
            commands::keys::update_key_with_new_key,
            commands::keys::get_key_data,
            commands::utils::fetch_url,
            commands::utils::get_build_commit,
            commands::utils::get_network_counters,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            log::error!("Failed to run Tauri application: {}", e);
            eprintln!("Failed to run Tauri application: {}", e);
        });
}
