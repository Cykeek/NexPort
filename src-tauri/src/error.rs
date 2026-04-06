use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum AppError {
    #[error("SSH connection failed: {0}")]
    SshConnection(String),
    #[error("SSH authentication failed: {0}")]
    SshAuth(String),
    #[error("Session not found: {0}")]
    SessionNotFound(String),
    #[error("SFTP error: {0}")]
    Sftp(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Database error: {0}")]
    Database(String),
    #[error("Key error: {0}")]
    Key(String),
    #[error("Vault error: {0}")]
    Vault(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type AppResult<T> = Result<T, AppError>;
