use std::fs::{create_dir_all, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;

use ssh_key::PublicKey;

#[allow(dead_code)]
fn algorithm_to_str(algo: ssh_key::Algorithm) -> &'static str {
    match algo {
        ssh_key::Algorithm::Ed25519 => "ssh-ed25519",
        ssh_key::Algorithm::Rsa { .. } => "ssh-rsa",
        ssh_key::Algorithm::Ecdsa { curve } => match curve {
            ssh_key::EcdsaCurve::NistP256 => "ecdsa-sha2-nistp256",
            ssh_key::EcdsaCurve::NistP384 => "ecdsa-sha2-nistp384",
            ssh_key::EcdsaCurve::NistP521 => "ecdsa-sha2-nistp521",
        },
        ssh_key::Algorithm::Dsa => "ssh-dss",
        ssh_key::Algorithm::SkEd25519 => "sk-ssh-ed25519@openssh.com",
        ssh_key::Algorithm::SkEcdsaSha2NistP256 => "sk-ecdsa-sha2-nistp256@openssh.com",
        _ => "unknown",
    }
}

#[allow(dead_code)]
fn host_entry(host: &str, port: u16) -> String {
    format!("[{}]:{}", host, port)
}

#[allow(dead_code)]
#[allow(dead_code)]
pub fn check_known_hosts_path(
    host: &str,
    port: u16,
    server_public_key: &PublicKey,
    path: &Path,
) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    let file =
        std::fs::File::open(path).map_err(|e| format!("Failed to open known_hosts file: {}", e))?;
    let reader = BufReader::new(file);

    let target_host = host_entry(host, port);
    let new_key_type = algorithm_to_str(server_public_key.algorithm());
    let new_key_data = server_public_key
        .to_openssh()
        .map_err(|e| format!("Failed to serialize public key: {}", e))?;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        let line = line.trim();

        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let parts: Vec<&str> = line.splitn(3, ' ').collect();
        if parts.len() < 3 {
            continue;
        }

        let file_host = parts[0];
        let file_key_type = parts[1];
        let file_key_data = parts[2];

        if file_host == target_host {
            if file_key_type == new_key_type && file_key_data == new_key_data {
                return Ok(true);
            } else {
                return Err("Host key has changed! Possible MITM attack.".to_string());
            }
        }
    }

    Ok(false)
}

/// Represents a single known host entry for frontend display.
#[derive(serde::Serialize, Clone)]
pub struct KnownHostEntry {
    pub host: String,
    pub port: u16,
    pub key_type: String,
    pub fingerprint: String,
}

/// Parse all entries from the known_hosts file for display.
pub fn list_known_hosts_path(path: &Path) -> Result<Vec<KnownHostEntry>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let file =
        std::fs::File::open(path).map_err(|e| format!("Failed to open known_hosts file: {}", e))?;
    let reader = BufReader::new(file);
    let mut entries = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        let line = line.trim();

        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let parts: Vec<&str> = line.splitn(3, ' ').collect();
        if parts.len() < 3 {
            continue;
        }

        let raw_host = parts[0];
        let key_type = parts[1].to_string();
        let key_data = parts[2];

        // Parse the "[host]:port" format back to components.
        let (host, port) = if raw_host.starts_with('[') {
            if let Some(close_bracket) = raw_host.find(']') {
                let host_part = &raw_host[1..close_bracket];
                let port_part = &raw_host[close_bracket + 2..]; // skip "]: "
                let port = port_part.parse::<u16>().unwrap_or(22);
                (host_part.to_string(), port)
            } else {
                (raw_host.to_string(), 22)
            }
        } else {
            (raw_host.to_string(), 22)
        };

        // Reconstruct a public key to compute the fingerprint.
        let openssh_line = format!("{} {}", key_type, key_data);
        if let Ok(pubkey) = ssh_key::PublicKey::from_openssh(&openssh_line) {
            let fingerprint = pubkey.fingerprint(Default::default()).to_string();
            entries.push(KnownHostEntry {
                host,
                port,
                key_type,
                fingerprint,
            });
        }
    }

    Ok(entries)
}

#[allow(dead_code)]
pub fn learn_known_hosts_path(
    host: &str,
    port: u16,
    server_public_key: &PublicKey,
    path: &Path,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory for known_hosts: {}", e))?;
        }
    }

    let key_type = algorithm_to_str(server_public_key.algorithm());
    let key_data = server_public_key
        .to_openssh()
        .map_err(|e| format!("Failed to serialize public key: {}", e))?;
    let entry = format!("{} {} {}\n", host_entry(host, port), key_type, key_data);

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Failed to open known_hosts file for writing: {}", e))?;

    file.write_all(entry.as_bytes())
        .map_err(|e| format!("Failed to write to known_hosts file: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_check_nonexistent_file() {
        let key = generate_test_key();
        let result =
            check_known_hosts_path("localhost", 22, &key, Path::new("/nonexistent/known_hosts"));
        assert_eq!(result.unwrap(), false);
    }

    #[test]
    fn test_learn_and_check() {
        let dir = std::env::temp_dir().join("ssh_known_hosts_test");
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("known_hosts");

        let key = generate_test_key();
        learn_known_hosts_path("localhost", 22, &key, &path).unwrap();

        let result = check_known_hosts_path("localhost", 22, &key, &path).unwrap();
        assert!(result);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_key_mismatch_detected() {
        let dir = std::env::temp_dir().join("ssh_known_hosts_test2");
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("known_hosts");

        let key1 = generate_test_key();
        learn_known_hosts_path("localhost", 22, &key1, &path).unwrap();

        let key2 = generate_test_key();
        let result = check_known_hosts_path("localhost", 22, &key2, &path);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            "Host key has changed! Possible MITM attack."
        );

        let _ = fs::remove_dir_all(&dir);
    }

    fn generate_test_key() -> PublicKey {
        let key_bytes: Vec<u8> = (0..32).map(|i| i as u8).collect();
        PublicKey::from_ed25519(key_bytes.try_into().unwrap()).unwrap()
    }
}
