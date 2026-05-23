use std::fs;
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};

use russh::client;
use russh::keys::{decode_secret_key, PrivateKeyWithHashAlg};
use russh_sftp::client::SftpSession;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use sysinfo::Disks;
use tauri::{State, Emitter, Manager};
use zeroize::Zeroize;
use dashmap::DashMap;

use tokio::sync::Mutex as TokioMutex;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::ssh::known_hosts;
use crate::ssh::session::get_known_hosts_path;
use crate::commands::utils::{
    validate_identifier, load_connection_credentials,
    has_control_chars,
};

const MAX_SESSION_ID_LEN: usize = 128;
const MAX_CONNECTION_ID_LEN: usize = 128;
const MAX_PATH_LEN: usize = 4096;
const CHUNK_SIZE: usize = 256 * 1024;
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(100);
const DELETE_SCAN_EMIT_EVERY: u64 = 5;
const DELETE_YIELD_INTERVAL: usize = 32;
const UPLOAD_PROGRESS_EVENT: &str = "sftp-upload-progress";
const DOWNLOAD_PROGRESS_EVENT: &str = "sftp-download-progress";
const DELETE_PROGRESS_EVENT: &str = "sftp-delete-progress";

fn emit_timing(
    last_emit_bytes: &mut u64,
    last_emit_time: &mut std::time::Instant,
    app: &tauri::AppHandle,
    current_value: u64,
) -> (Option<f64>, Option<f64>) {
    let now = std::time::Instant::now();
    let elapsed = now.duration_since(*last_emit_time).as_secs_f64();
    let speed = if elapsed > 0.0 && current_value > *last_emit_bytes {
        Some((current_value - *last_emit_bytes) as f64 / elapsed)
    } else {
        None
    };
    let disk_speed = app.state::<AppState>().get_disk_speed();
    *last_emit_bytes = current_value;
    *last_emit_time = now;
    (speed, disk_speed)
}

struct ProgressTracker {
    last_emit_bytes: u64,
    last_emit_time: std::time::Instant,
}

impl ProgressTracker {
    fn new() -> Self {
        Self { last_emit_bytes: 0, last_emit_time: std::time::Instant::now() }
    }

    fn should_emit(&self) -> bool {
        self.last_emit_time.elapsed() >= PROGRESS_EMIT_INTERVAL
    }

    fn emit(&mut self, app: &tauri::AppHandle, event: &str, file_name: &str, bytes_sent: u64, total_bytes: u64) {
        let (speed, disk_speed) = emit_timing(&mut self.last_emit_bytes, &mut self.last_emit_time, app, bytes_sent);
        let _ = app.emit(event, TransferProgress {
            file_name: file_name.to_string(), bytes_sent, total_bytes, speed, disk_speed,
        });
    }

    fn emit_final(&mut self, app: &tauri::AppHandle, event: &str, file_name: &str, bytes_sent: u64, total_bytes: u64, file_start_bytes: u64) {
        let elapsed = self.last_emit_time.elapsed().as_secs_f64();
        if elapsed > 0.0 && bytes_sent > file_start_bytes {
            let speed = Some((bytes_sent - file_start_bytes) as f64 / elapsed.max(0.001));
            let disk_speed = app.state::<AppState>().get_disk_speed();
            let _ = app.emit(event, TransferProgress {
                file_name: file_name.to_string(),
                bytes_sent,
                total_bytes,
                speed,
                disk_speed,
            });
        }
        self.last_emit_bytes = bytes_sent;
        self.last_emit_time = std::time::Instant::now();
    }
}

/// Copy from a sync std::io::Read (e.g. BufReader<File>) to an async writer (e.g. SftpFile).
async fn copy_sync_to_async<R: std::io::Read, W: tokio::io::AsyncWrite + Unpin>(
    app: &tauri::AppHandle,
    event: &str,
    file_name: &str,
    cancel_flag: &Arc<AtomicBool>,
    total_size: u64,
    tracker: &mut ProgressTracker,
    buf: &mut [u8],
    total_bytes: &mut u64,
    reader: &mut R,
    writer: &mut W,
) -> AppResult<()> {
    loop {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(AppError::InvalidInput("Transfer canceled by user".to_string()));
        }
        let n = reader.read(buf).map_err(AppError::Io)?;
        if n == 0 {
            return Ok(());
        }
        writer.write_all(&buf[..n]).await.map_err(|e| AppError::SshConnection(e.to_string()))?;
        *total_bytes += n as u64;
        if tracker.should_emit() || *total_bytes >= total_size {
            tracker.emit(app, event, file_name, *total_bytes, total_size);
        }
    }
}

/// Copy from an async reader (e.g. SftpFile) to a sync std::io::Write (e.g. File).
async fn copy_async_to_sync<R: tokio::io::AsyncRead + Unpin, W: std::io::Write>(
    app: &tauri::AppHandle,
    event: &str,
    file_name: &str,
    cancel_flag: &Arc<AtomicBool>,
    total_size: u64,
    tracker: &mut ProgressTracker,
    buf: &mut [u8],
    total_bytes: &mut u64,
    reader: &mut R,
    writer: &mut W,
) -> AppResult<()> {
    loop {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(AppError::InvalidInput("Transfer canceled by user".to_string()));
        }
        let n = reader.read(buf).await.map_err(|e| AppError::SshConnection(e.to_string()))?;
        if n == 0 {
            return Ok(());
        }
        writer.write_all(&buf[..n]).map_err(AppError::Io)?;
        *total_bytes += n as u64;
        if tracker.should_emit() || *total_bytes >= total_size {
            tracker.emit(app, event, file_name, *total_bytes, total_size);
        }
    }
}

fn validate_path(path: &str, field: &str) -> AppResult<()> {
    if path.trim().is_empty() || path.len() > MAX_PATH_LEN || path.contains('\0') || has_control_chars(path) {
        return Err(AppError::InvalidInput(format!("Invalid {}", field)));
    }
    Ok(())
}

fn normalize_remote_dir(path: &str) -> String {
    if path.trim().is_empty() {
        ".".to_string()
    } else {
        path.replace('\\', "/")
    }
}

fn join_remote_path(dir: &str, child: &str) -> String {
    let d = normalize_remote_dir(dir);
    match d.as_str() {
        "/" => format!("/{}", child),
        "." => child.to_string(),
        _ => format!("{}/{}", d.trim_end_matches('/'), child),
    }
}

fn parent_local_path(path: &str) -> Option<String> {
    Path::new(path)
        .parent()
        .map(|v| v.to_string_lossy().to_string())
        .filter(|v| !v.is_empty())
}

fn strip_win_long_path(path: &str) -> &str {
    path.strip_prefix("\\\\?\\").unwrap_or(path)
}

fn get_session_arc(state: &State<'_, AppState>, session_id: &str) -> AppResult<Arc<TokioMutex<SftpConnection>>> {
    state.sftp_sessions.get(session_id)
        .map(|ref_guard| Arc::clone(&*ref_guard))
        .ok_or_else(|| AppError::SessionNotFound(session_id.to_string()))
}

fn file_basename(path: &str) -> String {
    path.replace('\\', "/").split('/').filter(|s| !s.is_empty()).last()
        .unwrap_or(path).to_string()
}

fn sort_entries(entries: &mut [SftpFileEntry]) {
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
}

fn is_dot_or_dotdot(name: &str) -> bool {
    name == "." || name == ".."
}

pub struct SftpConnection {
    pub handle: client::Handle<SftpClientHandler>,
    pub session: SftpSession,
}

pub struct SftpClientHandler {
    host: String,
    port: u16,
    known_hosts_path: PathBuf,
    trust_on_first_use: Arc<AtomicBool>,
}

impl client::Handler for SftpClientHandler {
    type Error = russh::Error;

    async fn check_server_key(&mut self, server_public_key: &russh::keys::PublicKey) -> Result<bool, Self::Error> {
        let parsed_pubkey = server_public_key
            .to_openssh()
            .ok()
            .and_then(|k| ssh_key::PublicKey::from_openssh(&k).ok())
            .ok_or(russh::Error::KeyChanged { line: 0 })?;

        match known_hosts::check_known_hosts_path(&self.host, self.port, &parsed_pubkey, &self.known_hosts_path) {
            Ok(true) => Ok(true),
            Ok(false) => {
                let fingerprint = server_public_key.fingerprint(Default::default()).to_string();
                if self.trust_on_first_use.load(Ordering::SeqCst) {
                    log::warn!(
                        "[SECURITY] First SFTP connection to {}:{}. Auto-accepting host key (TOFU). Fingerprint: {}",
                        self.host, self.port, fingerprint
                    );
                    known_hosts::learn_known_hosts_path(&self.host, self.port, &parsed_pubkey, &self.known_hosts_path)
                        .map_err(|_| russh::Error::KeyChanged { line: 0 })?;
                    Ok(true)
                } else {
                    Err(russh::Error::KeyChanged { line: 0 })
                }
            }
            Err(_) => Err(russh::Error::KeyChanged { line: 0 }),
        }
    }
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SftpFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified_at: Option<u64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDirListing {
    pub path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<SftpFileEntry>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDirListing {
    pub path: String,
    pub entries: Vec<SftpFileEntry>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResult {
    pub remote_path: String,
    pub bytes_uploaded: u64,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    pub file_name: String,
    pub bytes_sent: u64,
    pub total_bytes: u64,
    pub speed: Option<f64>,
    pub disk_speed: Option<f64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub local_path: String,
    pub bytes_downloaded: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferDirResult {
    pub items_transferred: u32,
    pub total_bytes: u64,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeleteProgress {
    pub file_name: String,
    pub items_deleted: u64,
    pub total_items: u64,
    pub bytes_processed: u64,
    pub total_bytes: u64,
    pub current_file_bytes_processed: u64,
    pub current_file_total_bytes: u64,
    pub speed: Option<f64>,
    pub disk_speed: Option<f64>,
    pub phase: String,
}

struct DeleteProgressTracker {
    last_emit_bytes: u64,
    last_emit_time: std::time::Instant,
}

impl DeleteProgressTracker {
    fn new() -> Self {
        Self { last_emit_bytes: 0, last_emit_time: std::time::Instant::now() }
    }

    fn emit(
        &mut self,
        app: &tauri::AppHandle,
        file_name: &str,
        items_deleted: u64,
        bytes_processed: u64,
        total_bytes: u64,
        total_items: u64,
        current_file_bytes_processed: u64,
        current_file_total_bytes: u64,
        phase: &str,
    ) {
        let (speed, disk_speed) = emit_timing(&mut self.last_emit_bytes, &mut self.last_emit_time, app, bytes_processed);
        let _ = app.emit(DELETE_PROGRESS_EVENT, DeleteProgress {
            file_name: file_name.to_string(), items_deleted, total_items,
            bytes_processed, total_bytes, current_file_bytes_processed,
            current_file_total_bytes, speed, disk_speed, phase: phase.to_string(),
        });
    }
}

#[derive(Clone)]
struct RemoteDeleteFile {
    path: String,
    size: u64,
}

#[derive(Clone)]
struct LocalDeleteFile {
    path: PathBuf,
    name: String,
    size: u64,
}

async fn collect_all_remote_entries(
    conn: &Arc<TokioMutex<SftpConnection>>,
    root: &str,
    cancel_flag: &Arc<AtomicBool>,
    app: &tauri::AppHandle,
    tracker: &mut DeleteProgressTracker,
) -> AppResult<(Vec<RemoteDeleteFile>, Vec<String>, u64)> {
    let mut scan_stack = vec![root.to_string()];
    let mut dir_list: Vec<String> = vec![root.to_string()];
    let mut files: Vec<RemoteDeleteFile> = Vec::new();
    let mut total_bytes: u64 = 0;
    let mut scanned_entries: u64 = 0;

    while let Some(current) = scan_stack.pop() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(AppError::InvalidInput("Delete canceled by user".to_string()));
        }

        let entries = {
            let guard = conn.lock().await;
            guard.session.read_dir(&current).await.map_err(|e| AppError::SshConnection(e.to_string()))?
        };

        for entry in entries {
            let name = entry.file_name();
            if is_dot_or_dotdot(&name) {
                continue;
            }
            scanned_entries += 1;
            if scanned_entries % DELETE_SCAN_EMIT_EVERY == 0 {
                tracker.emit(app, &name, scanned_entries, 0, 1, 0, 0, 1, "scanning");
            }

            let child_path = format!("{}/{}", current.trim_end_matches('/'), name);
            let meta = entry.metadata();
            if meta.is_dir() {
                dir_list.push(child_path.clone());
                scan_stack.push(child_path);
            } else {
                let size = meta.size.unwrap_or(0);
                total_bytes += size;
                files.push(RemoteDeleteFile { path: child_path, size });
            }
        }
    }

    Ok((files, dir_list, total_bytes))
}

fn collect_local_delete_entries(
    root: &Path,
    cancel_flag: &Arc<AtomicBool>,
    app: &tauri::AppHandle,
    tracker: &mut DeleteProgressTracker,
) -> AppResult<(Vec<LocalDeleteFile>, Vec<PathBuf>, u64)> {
    let mut scan_stack = vec![root.to_path_buf()];
    let mut dir_list: Vec<PathBuf> = vec![root.to_path_buf()];
    let mut files: Vec<LocalDeleteFile> = Vec::new();
    let mut total_bytes: u64 = 0;
    let mut scanned_entries: u64 = 0;

    while let Some(current) = scan_stack.pop() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(AppError::InvalidInput("Delete canceled by user".to_string()));
        }

        let entries = fs::read_dir(&current).map_err(|e| AppError::Io(e))?;
        for entry in entries {
            let entry = entry.map_err(|e| AppError::Io(e))?;
            let entry_path = entry.path();
            let scan_name = entry_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| entry_path.to_string_lossy().to_string());
            scanned_entries += 1;
            if scanned_entries % DELETE_SCAN_EMIT_EVERY == 0 {
                tracker.emit(app, &scan_name, scanned_entries, 0, 1, 0, 0, 1, "scanning");
            }
            if entry_path.is_dir() {
                dir_list.push(entry_path.clone());
                scan_stack.push(entry_path);
            } else {
                let size = entry.metadata().map_err(|e| AppError::Io(e))?.len();
                total_bytes += size;
                let name = entry_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| entry_path.to_string_lossy().to_string());
                files.push(LocalDeleteFile {
                    path: entry_path,
                    name,
                    size,
                });
            }
        }
    }

    Ok((files, dir_list, total_bytes))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
    pub file_system: String,
    pub is_removable: bool,
}

fn init_cancel_flag_in_map(map: &DashMap<String, Arc<AtomicBool>>, key: &str) -> Arc<AtomicBool> {
    let flag = map.entry(key.to_string()).or_insert_with(|| Arc::new(AtomicBool::new(false))).clone();
    flag.store(false, Ordering::SeqCst);
    flag
}

fn set_cancel_flag_in_map(map: &DashMap<String, Arc<AtomicBool>>, key: &str) {
    map.entry(key.to_string())
        .or_insert_with(|| Arc::new(AtomicBool::new(false)))
        .store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn sftp_connect(
    session_id: String,
    connection_id: String,
    trust_on_first_use: Option<bool>,
    state: State<'_, AppState>,
) -> AppResult<String> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    validate_identifier(&connection_id, "connection ID", MAX_CONNECTION_ID_LEN)?;

    let mut creds = load_connection_credentials(&state, &connection_id, MAX_CONNECTION_ID_LEN)?;

    let known_hosts_path = get_known_hosts_path();
    let handler = SftpClientHandler {
        host: creds.host.clone(),
        port: creds.port,
        known_hosts_path,
        trust_on_first_use: Arc::new(AtomicBool::new(trust_on_first_use.unwrap_or(true))),
    };

    let config = Arc::new(client::Config {
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        inactivity_timeout: Some(Duration::from_secs(120)),
        nodelay: true,
        ..client::Config::default()
    });
    let mut ssh = client::connect(config, (creds.host.as_str(), creds.port), handler)
        .await
        .map_err(|e| AppError::SshConnection(e.to_string()))?;

    if let Some(ref key_content) = creds.key_data {
        let key_pair = decode_secret_key(key_content.trim(), None)
            .map_err(|e| AppError::SshAuth(format!("Failed to decode key: {}", e)))?;
        let key_with_hash = PrivateKeyWithHashAlg::new(Arc::new(key_pair), None);
        let auth = ssh
            .authenticate_publickey(&creds.username, key_with_hash)
            .await
            .map_err(|e| AppError::SshAuth(e.to_string()))?;
        if !auth.success() {
            return Err(AppError::SshAuth("Authentication failed".to_string()));
        }
    } else if let Some(ref password) = creds.password {
        let auth = ssh
            .authenticate_password(&creds.username, password)
            .await
            .map_err(|e| AppError::SshAuth(e.to_string()))?;
        if !auth.success() {
            return Err(AppError::SshAuth("Authentication failed".to_string()));
        }
    } else {
        return Err(AppError::SshAuth("No authentication method available".to_string()));
    }

    if let Some(ref mut p) = creds.password {
        p.zeroize();
    }
    if let Some(ref mut k) = creds.key_data {
        k.zeroize();
    }

    let channel = ssh
        .channel_open_session()
        .await
        .map_err(|e| AppError::SshConnection(e.to_string()))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| AppError::SshConnection(e.to_string()))?;

    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| AppError::SshConnection(e.to_string()))?;

    state.sftp_sessions.insert(session_id.clone(), Arc::new(tokio::sync::Mutex::new(SftpConnection {
        handle: ssh,
        session: sftp,
    })));
    Ok(session_id)
}

#[tauri::command]
pub async fn sftp_disconnect(session_id: String, state: State<'_, AppState>) -> AppResult<()> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    state.sftp_upload_cancellation.remove(&session_id);
    state.sftp_download_cancellation.remove(&session_id);
    if let Some((_, conn)) = state.sftp_sessions.remove(&session_id) {
        let conn = conn.lock().await;
        let _ = conn.session.close().await;
        let _ = conn.handle.disconnect(russh::Disconnect::ByApplication, "", "en").await;
    }
    Ok(())
}

#[tauri::command]
pub async fn sftp_list_remote_dir(
    session_id: String,
    path: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<RemoteDirListing> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    let dir = normalize_remote_dir(path.as_deref().unwrap_or("."));
    validate_path(&dir, "remote path")?;

    let conn = get_session_arc(&state, &session_id)?;
    let conn = conn.lock().await;

    let mut entries: Vec<SftpFileEntry> = conn.session.read_dir(&dir)
        .await
        .map_err(|e| AppError::SshConnection(e.to_string()))?
        .filter_map(|entry| {
            let name = entry.file_name();
            if is_dot_or_dotdot(&name) {
                return None;
            }
            let meta = entry.metadata();
            let is_dir = meta.is_dir();
            Some(SftpFileEntry {
                path: join_remote_path(&dir, &name),
                name,
                is_dir,
                size: if is_dir { None } else { meta.size },
                modified_at: meta.mtime.map(|v| v as u64),
            })
        })
        .collect();

    sort_entries(&mut entries);

    Ok(RemoteDirListing { path: dir, entries })
}

#[tauri::command]
pub fn sftp_list_local_dir(path: Option<String>) -> AppResult<LocalDirListing> {
    let start = match path {
        Some(v) => {
            validate_path(&v, "local path")?;
            PathBuf::from(v)
        }
        None => dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")),
    };

    if !start.exists() || !start.is_dir() {
        return Err(AppError::InvalidInput("Local path does not exist or is not a directory".to_string()));
    }

    let canonical = fs::canonicalize(&start).map_err(|e| AppError::Io(e))?;
    let canonical_str = strip_win_long_path(&canonical.to_string_lossy()).to_string();

    let mut entries: Vec<SftpFileEntry> = fs::read_dir(&canonical)
        .map_err(|e| AppError::Io(e))?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let path_str = strip_win_long_path(&path.to_string_lossy()).to_string();
            let metadata = entry.metadata().ok()?;
            let is_dir = metadata.is_dir();
            let modified_at = metadata.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs());
            Some(SftpFileEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: path_str,
                is_dir,
                size: if is_dir { None } else { Some(metadata.len()) },
                modified_at,
            })
        })
        .collect();

    sort_entries(&mut entries);

    Ok(LocalDirListing {
        parent_path: parent_local_path(&canonical_str),
        path: canonical_str,
        entries,
    })
}

#[tauri::command]
pub async fn sftp_upload_file(
    session_id: String,
    local_path: String,
    remote_dir: String,
    overwrite: Option<bool>,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> AppResult<UploadResult> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    validate_path(&local_path, "local path")?;
    validate_path(&remote_dir, "remote destination")?;

    let local = PathBuf::from(&local_path);
    if !local.exists() || !local.is_file() {
        return Err(AppError::InvalidInput("Local file does not exist or is not a file".to_string()));
    }

    let file_name = local.file_name().and_then(|n| n.to_str())
        .ok_or_else(|| AppError::InvalidInput("Invalid local filename".to_string()))?
        .to_string();
    let metadata = fs::metadata(&local).map_err(|e| AppError::Io(e))?;
    let total_bytes = metadata.len();

    let remote_path = join_remote_path(&remote_dir, &file_name);
    let allow_overwrite = overwrite.unwrap_or(false);

    let conn = get_session_arc(&state, &session_id)?;
    let conn = conn.lock().await;
    let cancel_flag = init_cancel_flag_in_map(&state.sftp_upload_cancellation, &session_id);

    if !allow_overwrite {
        let exists = conn.session.try_exists(&remote_path)
            .await
            .map_err(|e| AppError::SshConnection(e.to_string()))?;
        if exists {
            return Err(AppError::InvalidInput("Remote target already exists".to_string()));
        }
    }

    let mut remote_file = conn.session.create(&remote_path)
        .await
        .map_err(|e| AppError::SshConnection(e.to_string()))?;

    let file = fs::File::open(&local).map_err(|e| AppError::Io(e))?;
    let mut reader = BufReader::with_capacity(CHUNK_SIZE, file);
    let mut buf = vec![0u8; CHUNK_SIZE];
    let mut bytes_sent: u64 = 0;
    let mut tracker = ProgressTracker::new();

    match copy_sync_to_async(
        &app, UPLOAD_PROGRESS_EVENT, &file_name,
        &cancel_flag, total_bytes, &mut tracker,
        &mut buf, &mut bytes_sent, &mut reader, &mut remote_file,
    ).await {
        Ok(()) => {}
        Err(AppError::InvalidInput(_)) => {
            let _ = remote_file.shutdown().await;
            let _ = conn.session.remove_file(&remote_path).await;
            return Err(AppError::InvalidInput("Upload canceled by user".to_string()));
        }
        Err(e) => return Err(e),
    }

    remote_file.shutdown().await.map_err(|e| AppError::SshConnection(e.to_string()))?;
    Ok(UploadResult { remote_path, bytes_uploaded: total_bytes })
}

#[tauri::command]
pub async fn sftp_cancel_upload(session_id: String, state: State<'_, AppState>) -> AppResult<()> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    if !state.sftp_sessions.contains_key(&session_id) {
        return Err(AppError::SessionNotFound(session_id));
    }
    set_cancel_flag_in_map(&state.sftp_upload_cancellation, &session_id);
    Ok(())
}

#[tauri::command]
pub async fn sftp_cancel_download(session_id: String, state: State<'_, AppState>) -> AppResult<()> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    if !state.sftp_sessions.contains_key(&session_id) {
        return Err(AppError::SessionNotFound(session_id));
    }
    set_cancel_flag_in_map(&state.sftp_download_cancellation, &session_id);
    Ok(())
}

#[tauri::command]
pub fn sftp_cancel_delete(target_path: String, state: State<'_, AppState>) -> AppResult<()> {
    validate_path(&target_path, "target path")?;
    if !state.sftp_delete_cancellation.contains_key(&target_path) {
        return Err(AppError::InvalidInput("No delete operation in progress".to_string()));
    }
    set_cancel_flag_in_map(&state.sftp_delete_cancellation, &target_path);
    Ok(())
}

#[tauri::command]
pub async fn sftp_download_file(
    session_id: String,
    remote_path: String,
    local_dir: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> AppResult<DownloadResult> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    validate_path(&remote_path, "remote path")?;
    validate_path(&local_dir, "local directory")?;

    let local_dir_path = PathBuf::from(&local_dir);
    if !local_dir_path.exists() || !local_dir_path.is_dir() {
        return Err(AppError::InvalidInput("Local directory does not exist".to_string()));
    }

    let file_name = file_basename(&remote_path);
    let local_file_path = local_dir_path.join(&file_name);

    let conn = get_session_arc(&state, &session_id)?;
    let conn = conn.lock().await;
    let cancel_flag = init_cancel_flag_in_map(&state.sftp_download_cancellation, &session_id);

    let total_bytes = conn.session.metadata(&remote_path)
        .await
        .ok()
        .and_then(|m| m.size)
        .unwrap_or(0);

    let mut remote_file = conn.session.open(&remote_path)
        .await
        .map_err(|e| AppError::SshConnection(e.to_string()))?;

    let mut local_file = fs::File::create(&local_file_path).map_err(|e| AppError::Io(e))?;
    let mut chunk_buf = vec![0u8; CHUNK_SIZE];
    let mut bytes_downloaded: u64 = 0;
    let mut tracker = ProgressTracker::new();

    match copy_async_to_sync(
        &app, DOWNLOAD_PROGRESS_EVENT, &file_name,
        &cancel_flag, total_bytes, &mut tracker,
        &mut chunk_buf, &mut bytes_downloaded, &mut remote_file, &mut local_file,
    ).await {
        Ok(()) => {}
        Err(AppError::InvalidInput(_)) => {
            let _ = fs::remove_file(&local_file_path);
            return Err(AppError::InvalidInput("Download canceled by user".to_string()));
        }
        Err(e) => return Err(e),
    }

    local_file.flush().map_err(|e| AppError::Io(e))?;
    Ok(DownloadResult {
        local_path: strip_win_long_path(&local_file_path.to_string_lossy()).to_string(),
        bytes_downloaded,
    })
}

async fn scan_and_delete_remote_dir(
    conn: &Arc<TokioMutex<SftpConnection>>,
    path: &str,
    app: &tauri::AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> AppResult<()> {
    let root_name = file_basename(path);
    let mut tracker = DeleteProgressTracker::new();

    tracker.emit(app, &root_name, 0, 0, 1, 0, 0, 1, "scanning");

    let (files, mut dir_list, total_bytes) = collect_all_remote_entries(
        conn,
        path,
        cancel_flag,
        app,
        &mut tracker,
    ).await?;

    let total_items = (files.len() as u64 + dir_list.len() as u64).max(1);
    let display_total_bytes = total_bytes.max(1);
    let mut items_deleted: u64 = 0;
    let mut bytes_processed: u64 = 0;

    let mut delete_count: usize = 0;

    for file in &files {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(AppError::InvalidInput("Delete canceled by user".to_string()));
        }

        let file_total = file.size.max(1);
        tracker.emit(
            app,
            &file.path,
            items_deleted,
            bytes_processed,
            display_total_bytes,
            total_items,
            0,
            file_total,
            "deleting",
        );

        {
            let guard = conn.lock().await;
            guard.session.remove_file(&file.path).await.map_err(|e| AppError::SshConnection(e.to_string()))?;
        }
        items_deleted += 1;
        bytes_processed += file.size;

        tracker.emit(
            app,
            &file.path,
            items_deleted,
            bytes_processed,
            display_total_bytes,
            total_items,
            file_total,
            file_total,
            "deleting",
        );

        delete_count += 1;
        if delete_count % DELETE_YIELD_INTERVAL == 0 {
            tokio::task::yield_now().await;
        }
    }

    dir_list.sort_by(|a, b| b.matches('/').count().cmp(&a.matches('/').count()));
    for dir_path in &dir_list {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(AppError::InvalidInput("Delete canceled by user".to_string()));
        }
        let _ = {
            let guard = conn.lock().await;
            guard.session.remove_dir(dir_path).await
        };
        items_deleted += 1;
        let dir_name = file_basename(dir_path);
        tracker.emit(
            app,
            &dir_name,
            items_deleted,
            bytes_processed,
            display_total_bytes,
            total_items,
            1,
            1,
            "deleting",
        );
    }

    tracker.emit(
        app,
        &root_name,
        items_deleted,
        bytes_processed.max(display_total_bytes),
        display_total_bytes,
        total_items,
        1,
        1,
        "deleting",
    );
    Ok(())
}

#[tauri::command]
pub async fn sftp_delete_remote_path(
    session_id: String,
    path: String,
    is_dir: bool,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> AppResult<()> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    validate_path(&path, "target path")?;

    let conn = state.sftp_sessions.get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id))?;

    let cancel_flag = init_cancel_flag_in_map(&state.sftp_delete_cancellation, &path);

    if is_dir {
        scan_and_delete_remote_dir(&conn, &path, &app, &cancel_flag).await?;
    } else {
        let file_name = file_basename(&path);

        // Per-operation locking for single file delete
        let total_bytes = {
            let guard = conn.lock().await;
            guard.session.metadata(&path).await.ok().and_then(|m| m.size).unwrap_or(0)
        };
        let mut tracker = DeleteProgressTracker::new();
        let display_total = total_bytes.max(1);

        tracker.emit(&app, &file_name, 0, 0, display_total, 1, 0, display_total, "deleting");

        {
            let guard = conn.lock().await;
            guard.session.remove_file(&path).await.map_err(|e| AppError::SshConnection(e.to_string()))?;
        }

        tracker.emit(
            &app,
            &file_name,
            1,
            display_total,
            display_total,
            1,
            display_total,
            display_total,
            "deleting",
        );
    }

    state.sftp_delete_cancellation.remove(&path);
    Ok(())
}

#[tauri::command]
pub async fn sftp_upload_dir(
    session_id: String,
    local_path: String,
    remote_dir: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> AppResult<TransferDirResult> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    validate_path(&local_path, "local path")?;
    validate_path(&remote_dir, "remote destination")?;

    let local = PathBuf::from(&local_path);
    if !local.exists() || !local.is_dir() {
        return Err(AppError::InvalidInput("Local path does not exist or is not a directory".to_string()));
    }

    let folder_name = local.file_name().and_then(|n| n.to_str())
        .ok_or_else(|| AppError::InvalidInput("Invalid folder name".to_string()))?.to_string();

    let conn = get_session_arc(&state, &session_id)?;
    let conn = conn.lock().await;
    let cancel_flag = init_cancel_flag_in_map(&state.sftp_upload_cancellation, &session_id);

    let mut file_list: Vec<(PathBuf, String)> = Vec::new();
    let base_remote = join_remote_path(&remote_dir, &folder_name);
    let mut dirs_to_create: Vec<String> = Vec::new();

    let mut stack: Vec<(PathBuf, String)> = vec![(local.clone(), base_remote.clone())];
    while let Some((dir, remote_base)) = stack.pop() {
        dirs_to_create.push(remote_base.clone());
        for entry in fs::read_dir(&dir).map_err(|e| AppError::Io(e))? {
            let entry = entry.map_err(|e| AppError::Io(e))?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let remote_path = format!("{}/{}", remote_base.trim_end_matches('/'), name);
            if path.is_dir() {
                stack.push((path, remote_path));
            } else if path.is_file() {
                file_list.push((path, remote_path));
            }
        }
    }

    let total_folder_size: u64 = file_list.iter().filter_map(|(p, _)| fs::metadata(p).ok().map(|m| m.len())).sum();

    let mut uploaded_files: Vec<String> = Vec::new();
    let mut created_dirs: Vec<String> = Vec::new();

    async fn rollback(session: &SftpSession, files: &[String], dirs: &[String]) {
        for f in files.iter().rev() { let _ = session.remove_file(f).await; }
        for d in dirs.iter().rev() { let _ = session.remove_dir(d).await; }
    }

    for dir in &dirs_to_create {
        if cancel_flag.load(Ordering::SeqCst) {
            rollback(&conn.session, &uploaded_files, &created_dirs).await;
            return Err(AppError::InvalidInput("Upload canceled by user".to_string()));
        }
        if conn.session.create_dir(dir.clone()).await.is_ok() {
            created_dirs.push(dir.clone());
        }
    }

    let mut items_transferred: u32 = 0;
    let mut total_bytes: u64 = 0;
    let mut tracker = ProgressTracker::new();
    let mut buf = vec![0u8; CHUNK_SIZE];

    for (local_file, remote_path) in &file_list {
        if cancel_flag.load(Ordering::SeqCst) {
            rollback(&conn.session, &uploaded_files, &created_dirs).await;
            return Err(AppError::InvalidInput("Upload canceled by user".to_string()));
        }

        let file_name = local_file.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

        let mut remote_file = conn.session.create(remote_path)
            .await
            .map_err(|e| AppError::SshConnection(e.to_string()))?;

        let file = fs::File::open(local_file).map_err(|e| AppError::Io(e))?;
        let mut reader = BufReader::with_capacity(CHUNK_SIZE, file);

        let file_start_bytes = total_bytes;

        match copy_sync_to_async(
            &app, UPLOAD_PROGRESS_EVENT, &file_name,
            &cancel_flag, total_folder_size, &mut tracker,
            &mut buf, &mut total_bytes, &mut reader, &mut remote_file,
        ).await {
            Ok(()) => {}
            Err(AppError::InvalidInput(_)) => {
                let _ = remote_file.shutdown().await;
                rollback(&conn.session, &uploaded_files, &created_dirs).await;
                return Err(AppError::InvalidInput("Upload canceled by user".to_string()));
            }
            Err(e) => return Err(e),
        }

        let _ = remote_file.shutdown().await;
        uploaded_files.push(remote_path.clone());
        items_transferred += 1;

        tracker.emit_final(&app, UPLOAD_PROGRESS_EVENT, &file_name, total_bytes, total_folder_size, file_start_bytes);
    }

    Ok(TransferDirResult { items_transferred, total_bytes })
}

#[tauri::command]
pub async fn sftp_download_dir(
    session_id: String,
    remote_path: String,
    local_dir: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> AppResult<TransferDirResult> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    validate_path(&remote_path, "remote path")?;
    validate_path(&local_dir, "local directory")?;

    let local_dir_path = PathBuf::from(&local_dir);
    if !local_dir_path.exists() || !local_dir_path.is_dir() {
        return Err(AppError::InvalidInput("Local directory does not exist".to_string()));
    }

    let folder_name = file_basename(&remote_path);

    let conn = get_session_arc(&state, &session_id)?;
    let conn = conn.lock().await;
    let cancel_flag = init_cancel_flag_in_map(&state.sftp_download_cancellation, &session_id);

    let mut file_list: Vec<(String, PathBuf, u64)> = Vec::new();
    let base_local = local_dir_path.join(&folder_name);
    fs::create_dir_all(&base_local).map_err(|e| AppError::Io(e))?;

    let mut dirs_to_visit: Vec<(String, PathBuf)> = vec![(remote_path.clone(), base_local.clone())];

    while let Some((remote_dir_path, local_target)) = dirs_to_visit.pop() {
        if cancel_flag.load(Ordering::SeqCst) {
            for f in &file_list { let _ = fs::remove_file(&f.1); }
            let _ = fs::remove_dir_all(&base_local);
            return Err(AppError::InvalidInput("Download canceled by user".to_string()));
        }
        let entries = conn.session.read_dir(&remote_dir_path).await.map_err(|e| AppError::SshConnection(e.to_string()))?;
        for entry in entries {
            let name = entry.file_name();
            if is_dot_or_dotdot(&name) { continue; }
            let remote_entry_path = format!("{}/{}", remote_dir_path.trim_end_matches('/'), name);
            let local_entry_path = local_target.join(&name);
            if entry.metadata().is_dir() {
                fs::create_dir_all(&local_entry_path).map_err(|e| AppError::Io(e))?;
                dirs_to_visit.push((remote_entry_path, local_entry_path));
            } else {
                file_list.push((remote_entry_path, local_entry_path, entry.metadata().size.unwrap_or(0)));
            }
        }
    }

    let total_folder_size: u64 = file_list.iter().map(|(_, _, s)| *s).sum();
    let mut downloaded_files: Vec<PathBuf> = Vec::new();
    let mut items_transferred: u32 = 0;
    let mut total_bytes: u64 = 0;
    let mut tracker = ProgressTracker::new();

    let cleanup = |files: &[PathBuf], base: &Path| {
        for f in files { let _ = fs::remove_file(f); }
        let _ = fs::remove_dir_all(base);
    };

    for (remote_entry_path, local_entry_path, _file_size) in &file_list {
        if cancel_flag.load(Ordering::SeqCst) {
            cleanup(&downloaded_files, &base_local);
            return Err(AppError::InvalidInput("Download canceled by user".to_string()));
        }

        let name = remote_entry_path.split('/').last().unwrap_or("file").to_string();
        let mut remote_file = conn.session.open(remote_entry_path).await.map_err(|e| AppError::SshConnection(e.to_string()))?;

        let mut local_file = fs::File::create(local_entry_path).map_err(|e| AppError::Io(e))?;
        let mut chunk_buf = vec![0u8; CHUNK_SIZE];

        let file_start_bytes = total_bytes;

        match copy_async_to_sync(
            &app, DOWNLOAD_PROGRESS_EVENT, &name,
            &cancel_flag, total_folder_size, &mut tracker,
            &mut chunk_buf, &mut total_bytes, &mut remote_file, &mut local_file,
        ).await {
            Ok(()) => {}
            Err(AppError::InvalidInput(_)) => {
                cleanup(&downloaded_files, &base_local);
                return Err(AppError::InvalidInput("Download canceled by user".to_string()));
            }
            Err(e) => return Err(e),
        }

        downloaded_files.push(local_entry_path.clone());
        items_transferred += 1;

        tracker.emit_final(&app, DOWNLOAD_PROGRESS_EVENT, &name, total_bytes, total_folder_size, file_start_bytes);
    }

    Ok(TransferDirResult { items_transferred, total_bytes })
}

#[tauri::command]
pub async fn sftp_mkdir_remote(
    session_id: String,
    path: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    validate_path(&path, "directory path")?;

    let conn = get_session_arc(&state, &session_id)?;
    let conn = conn.lock().await;
    conn.session.create_dir(path)
        .await
        .map_err(|e| AppError::SshConnection(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn sftp_delete_local_path(
    path: String,
    is_dir: bool,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    validate_path(&path, "local path")?;
    let local_path = PathBuf::from(&path);
    if !local_path.exists() {
        return Err(AppError::InvalidInput("Path does not exist".to_string()));
    }

    let cancel_flag = init_cancel_flag_in_map(&state.sftp_delete_cancellation, &path);

    if is_dir {
        let root_name = local_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        let mut tracker = DeleteProgressTracker::new();

        tracker.emit(&app, &root_name, 0, 0, 1, 0, 0, 1, "scanning");

        let (files, dirs, total_bytes) = match collect_local_delete_entries(&local_path, &cancel_flag, &app, &mut tracker) {
            Ok(entries) => entries,
            Err(error) => {
                state.sftp_delete_cancellation.remove(&path);
                return Err(error);
            }
        };
        let total_items = (files.len() as u64 + dirs.len() as u64).max(1);
        let display_total_bytes = total_bytes.max(1);

        {
            let mut items_deleted: u64 = 0;
            let mut bytes_processed: u64 = 0;
            let mut delete_count: usize = 0;

            for file in &files {
                if cancel_flag.load(Ordering::SeqCst) {
                    state.sftp_delete_cancellation.remove(&path);
                    return Err(AppError::InvalidInput("Delete canceled by user".to_string()));
                }

                let file_total = file.size.max(1);
                tracker.emit(
                    &app,
                    &file.name,
                    items_deleted,
                    bytes_processed,
                    display_total_bytes,
                    total_items,
                    0,
                    file_total,
                    "deleting",
                );

                fs::remove_file(&file.path).map_err(|e| AppError::Io(e))?;
                items_deleted += 1;
                bytes_processed += file.size;

                tracker.emit(
                    &app,
                    &file.name,
                    items_deleted,
                    bytes_processed,
                    display_total_bytes,
                    total_items,
                    file_total,
                    file_total,
                    "deleting",
                );

                delete_count += 1;
                if delete_count % DELETE_YIELD_INTERVAL == 0 {
                    tokio::task::yield_now().await;
                }
            }

            fs::remove_dir_all(&local_path).map_err(|e| AppError::Io(e))?;
            items_deleted = total_items;

            tracker.emit(
                &app,
                &root_name,
                items_deleted,
                display_total_bytes,
                display_total_bytes,
                total_items,
                1,
                1,
                "deleting",
            );
        }
    } else {
        let file_name = local_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        let total_bytes = local_path.metadata().ok().map(|m| m.len()).unwrap_or(0);
        let mut tracker = DeleteProgressTracker::new();
        let display_total = total_bytes.max(1);

        tracker.emit(&app, &file_name, 0, 0, display_total, 1, 0, display_total, "deleting");

        fs::remove_file(&local_path).map_err(|e| AppError::Io(e))?;

        tracker.emit(
            &app,
            &file_name,
            1,
            display_total,
            display_total,
            1,
            display_total,
            display_total,
            "deleting",
        );
    }

    state.sftp_delete_cancellation.remove(&path);
    Ok(())
}

#[tauri::command]
pub fn sftp_list_local_drives() -> AppResult<Vec<DriveInfo>> {
    Ok(Disks::new_with_refreshed_list().iter().map(|disk| {
        let mount = disk.mount_point().to_string_lossy().to_string();
        let name_str = disk.name().to_string_lossy().to_string();
        DriveInfo {
            name: if name_str.is_empty() {
                format!("Local Disk ({})", mount.trim_end_matches('\\'))
            } else {
                format!("{} ({})", name_str, mount.trim_end_matches('\\'))
            },
            mount_point: mount,
            total_space: disk.total_space(),
            available_space: disk.available_space(),
            file_system: disk.file_system().to_string_lossy().to_string(),
            is_removable: disk.is_removable(),
        }
    }).collect())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileStat {
    pub name: String,
    pub path: String,
    pub size: Option<u64>,
    pub is_dir: bool,
    pub modified_at: Option<u64>,
    pub accessed_at: Option<u64>,
    pub permissions: Option<u32>,
    pub uid: Option<u32>,
    pub user: Option<String>,
    pub gid: Option<u32>,
    pub group: Option<String>,
}

#[tauri::command]
pub async fn sftp_rename_remote(
    session_id: String,
    old_path: String,
    new_path: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    validate_path(&old_path, "old path")?;
    validate_path(&new_path, "new path")?;
    let conn = get_session_arc(&state, &session_id)?;
    let conn = conn.lock().await;
    conn.session.rename(&old_path, &new_path).await
        .map_err(|e| AppError::SshConnection(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn sftp_rename_local(old_path: String, new_path: String) -> AppResult<()> {
    validate_path(&old_path, "old path")?;
    validate_path(&new_path, "new path")?;
    fs::rename(&old_path, &new_path).map_err(AppError::Io)?;
    Ok(())
}

#[tauri::command]
pub async fn sftp_stat_remote(
    session_id: String,
    path: String,
    state: State<'_, AppState>,
) -> AppResult<RemoteFileStat> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    validate_path(&path, "path")?;
    let conn = get_session_arc(&state, &session_id)?;
    let conn = conn.lock().await;
    let meta = conn.session.metadata(&path).await
        .map_err(|e| AppError::SshConnection(e.to_string()))?;
    let name = file_basename(&path);
    Ok(RemoteFileStat {
        name,
        path,
        size: meta.size,
        is_dir: meta.is_dir(),
        modified_at: meta.mtime.map(|v| v as u64),
        accessed_at: meta.atime.map(|v| v as u64),
        permissions: meta.permissions,
        uid: meta.uid,
        user: meta.user,
        gid: meta.gid,
        group: meta.group,
    })
}

#[tauri::command]
pub fn sftp_mkdir_local(path: String) -> AppResult<()> {
    validate_path(&path, "directory path")?;
    fs::create_dir(&path).map_err(AppError::Io)?;
    Ok(())
}

#[tauri::command]
pub async fn sftp_get_remote_home(session_id: String, state: State<'_, AppState>) -> AppResult<String> {
    validate_identifier(&session_id, "session ID", MAX_SESSION_ID_LEN)?;
    let guard = get_session_arc(&state, &session_id)?;
    let guard = guard.lock().await;
    guard.session.canonicalize(".").await.map_err(|e| AppError::SshConnection(e.to_string()))
}
