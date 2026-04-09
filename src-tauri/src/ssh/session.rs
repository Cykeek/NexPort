use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use russh::*;
use russh::keys::*;
use zeroize::Zeroize;

#[derive(Debug, Clone)]
pub struct UnknownHostKey {
    pub host: String,
    pub port: u16,
    pub key_type: String,
    pub fingerprint: String,
}

impl std::fmt::Display for UnknownHostKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Unknown host key for {}:{} (type: {}, fingerprint: {})", 
            self.host, self.port, self.key_type, self.fingerprint)
    }
}

impl std::error::Error for UnknownHostKey {}

pub(crate) struct ClientHandler {
    host: String,
    port: u16,
    known_hosts_path: PathBuf,
    pub unknown_key: Option<UnknownHostKey>,
    pub trust_on_first_use: Arc<AtomicBool>,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        match known_hosts::check_known_hosts_path(
            &self.host,
            self.port,
            server_public_key,
            &self.known_hosts_path,
        ) {
            Ok(true) => Ok(true), // Known and matching
            Ok(false) => {
                // Store info for potential user prompt
                let key_type = format!("{:?}", server_public_key.algorithm());
                let fingerprint = server_public_key.fingerprint(Default::default()).to_string();
                
                // Check if TOFU is enabled
                if self.trust_on_first_use.load(Ordering::SeqCst) {
                    log::warn!("[SECURITY] First connection to {}:{}. Auto-accepting host key (TOFU). Fingerprint: {}", 
                        self.host, self.port, fingerprint);
                    known_hosts::learn_known_hosts_path(
                        &self.host,
                        self.port,
                        server_public_key,
                        &self.known_hosts_path,
                    )
                    .map_err(|_| russh::Error::KeyChanged { line: 0 })?;
                    Ok(true)
                } else {
                    // Store for frontend to prompt user
                    self.unknown_key = Some(UnknownHostKey {
                        host: self.host.clone(),
                        port: self.port,
                        key_type,
                        fingerprint,
                    });
                    log::warn!("[SECURITY] Unknown host key for {}:{}. Connection requires user verification.", 
                        self.host, self.port);
                    Err(russh::Error::KeyChanged { line: 0 })
                }
            }
            Err(_) => Err(russh::Error::KeyChanged { line: 0 }),
        }
    }
}

pub struct SshSession {
    pub handle: Option<client::Handle<ClientHandler>>,
    pub channel: Option<Channel<client::Msg>>,
    #[allow(dead_code)]
    pub host: String,
    #[allow(dead_code)]
    pub port: u16,
    #[allow(dead_code)]
    pub username: String,
}

fn get_known_hosts_path() -> PathBuf {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ssh-connect");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("known_hosts")
}

impl SshSession {
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        password: Option<&str>,
        key_data: Option<&str>,
        trust_on_first_use: bool,
    ) -> Result<Self, String> {
        let known_hosts_path = get_known_hosts_path();
        let config = Arc::new(client::Config::default());
        let addr = (host, port);

        let handler = ClientHandler {
            host: host.to_string(),
            port,
            known_hosts_path,
            unknown_key: None,
            trust_on_first_use: Arc::new(std::sync::atomic::AtomicBool::new(trust_on_first_use)),
        };

        let mut session = client::connect(config, addr, handler)
            .await
            .map_err(|e| e.to_string())?;

        if let Some(key_content) = key_data {
            let key_pair = decode_secret_key(key_content.trim(), None)
                .map_err(|e| format!("Failed to decode key: {}", e))?;
            
            let key_with_hash = PrivateKeyWithHashAlg::new(Arc::new(key_pair), None);
            
            let auth_result = session
                .authenticate_publickey(username, key_with_hash)
                .await;
            
            let auth = auth_result.map_err(|e| format!("Auth error: {}", e))?;
            if !auth.success() {
                return Err("Authentication failed".into());
            }
        } else if let Some(pwd) = password {
            let mut pwd_owned = pwd.to_string();
            let auth = session
                .authenticate_password(username, &pwd_owned)
                .await
                .map_err(|e| e.to_string())?;
            pwd_owned.zeroize();
            if !auth.success() {
                return Err("Authentication failed".into());
            }
        } else {
            return Err("No authentication method provided".into());
        }

        let channel = session
            .channel_open_session()
            .await
            .map_err(|e| e.to_string())?;

        channel
            .request_pty(true, "xterm-256color", 80, 24, 0, 0, &[])
            .await
            .map_err(|e| e.to_string())?;

        channel
            .request_shell(true)
            .await
            .map_err(|e| e.to_string())?;

        Ok(Self {
            handle: Some(session),
            channel: Some(channel),
            host: host.to_string(),
            port,
            username: username.to_string(),
        })
    }

    pub async fn resize(&mut self, cols: u32, rows: u32) -> Result<(), String> {
        if let Some(ref mut ch) = self.channel {
            ch.window_change(cols, rows, 0, 0)
                .await
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub async fn write(&mut self, data: &str) -> Result<(), String> {
        if let Some(ref mut ch) = self.channel {
            ch.data(data.as_bytes())
                .await
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub async fn read(&mut self, dur: std::time::Duration) -> Result<String, String> {
        let ch = self.channel.as_mut().ok_or("No channel available")?;
        
        let mut output = String::new();
        let mut got_eof = false;
        let start = std::time::Instant::now();
        
        loop {
            let remaining = dur.saturating_sub(start.elapsed());
            if remaining.is_zero() {
                break;
            }
            
            match tokio::time::timeout(remaining, ch.wait()).await {
                Ok(Some(msg)) => {
                    match msg {
                        ChannelMsg::Data { data } => {
                            let text = String::from_utf8_lossy(data.as_ref()).to_string();
                            output.push_str(&text);
                        }
                        ChannelMsg::ExtendedData { data, .. } => {
                            let text = String::from_utf8_lossy(data.as_ref()).to_string();
                            output.push_str(&text);
                        }
                        ChannelMsg::Eof => {
                            got_eof = true;
                            break;
                        }
                        _ => {}
                    }
                }
                Ok(None) => {
                    got_eof = true;
                    break;
                }
                Err(_) => {
                    break;
                }
            }
        }
        
        // If we received EOF, return empty string with EOF indicator
        // The frontend will detect this and close the terminal
        if got_eof && output.is_empty() {
            return Ok("__EOF__".to_string());
        }
        
        Ok(output)
    }

    pub async fn create_sftp(&self) -> Result<russh_sftp::client::SftpSession, String> {
        let handle = self.handle.as_ref().ok_or("No SSH session handle")?;
        let channel = handle
            .channel_open_session()
            .await
            .map_err(|e| e.to_string())?;

        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| e.to_string())?;

        russh_sftp::client::SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn disconnect(&mut self) -> Result<(), String> {
        if let Some(ref mut ch) = self.channel {
            ch.eof().await.ok();
        }
        if let Some(ref mut handle) = self.handle {
            handle.disconnect(russh::Disconnect::ByApplication, "", "en").await.ok();
        }
        self.channel = None;
        self.handle = None;
        Ok(())
    }
}
