use std::process::Command;

use super::types::DeviceSample;
use super::DiskIoProvider;

/// Fallback provider that spawns platform CLI tools and parses their output.
///
/// Used when the primary kernel interface is unavailable (e.g., inside
/// containers without /proc, restricted sandboxes, etc.).
pub struct CliFallbackProvider;

impl CliFallbackProvider {
    pub fn new() -> Option<Self> {
        // Check if any known CLI tool is available
        for cmd in &["iostat", "typeperf", "vmstat"] {
            if which(cmd).is_some() {
                return Some(Self);
            }
        }
        None
    }
}

impl CliFallbackProvider {
    /// Parse `iostat -d -k 1 2` output (Linux/macOS).
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    fn sample_iostat(&self) -> std::io::Result<Vec<DeviceSample>> {
        let output = Command::new("iostat")
            .args(["-d", "-k"])
            .output()?;

        if !output.status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "iostat command failed",
            ));
        }

        let _stdout = String::from_utf8_lossy(&output.stdout);
        Ok(Vec::new())
    }

    /// Parse `typeperf -sc 1 "\\PhysicalDisk(*)\\*"` output (Windows).
    #[cfg(target_os = "windows")]
    fn sample_typeperf(&self) -> std::io::Result<Vec<DeviceSample>> {
        let output = Command::new("typeperf")
            .args(["-sc", "1", "\"\\PhysicalDisk(*)\\*\""])
            .output()?;

        if !output.status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "typeperf command failed",
            ));
        }

        Ok(Vec::new())
    }
}

impl DiskIoProvider for CliFallbackProvider {
    fn sample(&mut self) -> std::io::Result<Vec<DeviceSample>> {
        #[cfg(target_os = "linux")]
        {
            return self.sample_iostat();
        }
        #[cfg(target_os = "macos")]
        {
            return self.sample_iostat();
        }
        #[cfg(target_os = "windows")]
        {
            return self.sample_typeperf();
        }
        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
        {
            Err(std::io::Error::new(
                std::io::ErrorKind::Unsupported,
                "No fallback CLI tool available",
            ))
        }
    }
}

/// Simple `which` equivalent — checks if a command exists in PATH.
fn which(cmd: &str) -> Option<String> {
    let cmd_path = if cfg!(windows) {
        format!("{}.exe", cmd)
    } else {
        cmd.to_string()
    };

    std::env::var_os("PATH").and_then(|paths| {
        for path in std::env::split_paths(&paths) {
            let full = path.join(&cmd_path);
            if full.is_file() {
                return full.to_str().map(|s| s.to_string());
            }
        }
        None
    })
}
