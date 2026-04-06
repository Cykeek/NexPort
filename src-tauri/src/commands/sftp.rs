use serde::Serialize;
use tauri::State;
use crate::state::AppState;
use crate::error::{AppResult, AppError};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex as TokioMutex;

#[derive(Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
}

async fn with_sftp<F, T>(
    session: &Arc<TokioMutex<crate::ssh::session::SshSession>>,
    f: impl FnOnce(russh_sftp::client::SftpSession) -> F,
) -> AppResult<T>
where
    F: std::future::Future<Output = AppResult<T>>,
{
    let sess = session.lock().await;
    let sftp = sess.create_sftp().await.map_err(|e| AppError::Sftp(e.to_string()))?;
    drop(sess);
    f(sftp).await
}

#[tauri::command]
pub async fn sftp_list_dir(
    session_id: String,
    path: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<FileEntry>> {
    let session = state.sessions.get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    
    with_sftp(&session, |sftp| async move {
        let entries = sftp.read_dir(&path).await
            .map_err(|e| AppError::Sftp(e.to_string()))?;
        
        let result: Vec<FileEntry> = entries.into_iter().map(|entry| {
            let name = entry.file_name().clone();
            let is_dir = entry.file_type().is_dir();
            let size = entry.metadata().len();
            let modified = entry.metadata().mtime.map(|m| m as u64);
            
            FileEntry {
                name,
                is_dir,
                size,
                modified,
            }
        }).collect();
        
        Ok(result)
    }).await
}

#[tauri::command]
pub async fn sftp_read_file(
    session_id: String,
    path: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<u8>> {
    let session = state.sessions.get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    
    with_sftp(&session, |sftp| async move {
        let mut file = sftp.open(&path).await
            .map_err(|e| AppError::Sftp(e.to_string()))?;
        
        let mut data = Vec::new();
        file.read_to_end(&mut data).await
            .map_err(|e| AppError::Sftp(e.to_string()))?;
        
        Ok(data)
    }).await
}

#[tauri::command]
pub async fn sftp_write_file(
    session_id: String,
    path: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let session = state.sessions.get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    
    with_sftp(&session, |sftp| async move {
        let mut file = sftp.create(&path).await
            .map_err(|e| AppError::Sftp(e.to_string()))?;
        
        file.write_all(&data).await
            .map_err(|e| AppError::Sftp(e.to_string()))?;
        
        Ok(())
    }).await
}

#[tauri::command]
pub async fn sftp_delete(
    session_id: String,
    path: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let session = state.sessions.get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    
    with_sftp(&session, |sftp| async move {
        if sftp.remove_file(&path).await.is_err() {
            sftp.remove_dir(&path).await
                .map_err(|e| AppError::Sftp(e.to_string()))?;
        }
        Ok(())
    }).await
}

#[tauri::command]
pub async fn sftp_mkdir(
    session_id: String,
    path: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let session = state.sessions.get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    
    with_sftp(&session, |sftp| async move {
        sftp.create_dir(&path).await
            .map_err(|e| AppError::Sftp(e.to_string()))?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn sftp_rename(
    session_id: String,
    old_path: String,
    new_path: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let session = state.sessions.get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    
    with_sftp(&session, |sftp| async move {
        sftp.rename(&old_path, &new_path).await
            .map_err(|e| AppError::Sftp(e.to_string()))?;
        Ok(())
    }).await
}
