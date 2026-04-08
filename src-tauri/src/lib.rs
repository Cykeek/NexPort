mod commands;
mod error;
mod ssh;
mod state;
mod crypto;
mod vault;

use state::AppState;
use tauri::Manager;
use std::panic;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

fn write_panic_log(msg: &str) {
    // Try to write to app directory or current dir
    let log_paths = [
        PathBuf::from("nexport_crash.log"),
        PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join("nexport_crash.log"),
    ];
    for log_path in &log_paths {
        if let Ok(mut file) = OpenOptions::new().create(true).write(true).open(log_path) {
            let _ = file.write_all(msg.as_bytes());
            break;
        }
    }
    eprintln!("{}", msg);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Set panic hook BEFORE tauri starts - this captures ANY crash
    panic::set_hook(Box::new(|panic_info| {
        let msg = format!("[{}] PANIC: {:?}\n", 
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), 
            panic_info
        );
        write_panic_log(&msg);
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Get app data directory
            let data_dir = match app.path().app_data_dir() {
                Ok(d) => d,
                Err(e) => {
                    let msg = format!("Failed to get app data directory: {}", e);
                    write_panic_log(&msg);
                    return Err(e.into());
                }
            };
            
            // Create data directory if it doesn't exist
            if let Err(e) = std::fs::create_dir_all(&data_dir) {
                let msg = format!("Failed to create app data directory: {}", e);
                write_panic_log(&msg);
            }
            
            // Create empty state (database will be initialized on first save)
            let db_path = data_dir.join("connections.redb");
            let app_state = AppState::new_empty(db_path, data_dir);
            
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
        .unwrap_or_else(|e| {
            let msg = format!("Failed to run Tauri application: {}", e);
            write_panic_log(&msg);
            eprintln!("{}", msg);
        });
}
