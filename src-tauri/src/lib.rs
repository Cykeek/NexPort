mod commands;
mod error;
mod ssh;
mod state;
mod crypto;
mod vault;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("connections.redb");
            let app_state = AppState::new(&db_path, &data_dir)?;
            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ssh::ssh_connect,
            commands::ssh::ssh_disconnect,
            commands::ssh::ssh_resize,
            commands::ssh::ssh_write,
            commands::ssh::ssh_read,
            commands::ssh::ssh_detect_os,
            commands::sftp::sftp_list_dir,
            commands::sftp::sftp_read_file,
            commands::sftp::sftp_write_file,
            commands::sftp::sftp_delete,
            commands::sftp::sftp_mkdir,
            commands::sftp::sftp_rename,
            commands::connections::save_connection,
            commands::connections::get_connections,
            commands::connections::delete_connection,
            commands::connections::check_host_status,
            commands::connections::update_connection_os,
            commands::keys::generate_key,
            commands::keys::import_key,
            commands::keys::list_keys,
            commands::keys::delete_key,
            commands::keys::update_key,
            commands::keys::update_key_with_new_key,
            commands::keys::get_key_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
