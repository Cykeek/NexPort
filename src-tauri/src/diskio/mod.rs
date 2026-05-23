pub mod types;
#[cfg(test)]
mod tests;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "freebsd")]
mod freebsd;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;
mod fallback;

use std::collections::HashMap;
use std::time::{Duration, Instant};

use types::{DeviceSample, Throughput};

/// OS-agnostic trait for reading cumulative disk I/O counters.
pub trait DiskIoProvider: Send + Sync {
    /// Read cumulative I/O counters for all physical block devices.
    fn sample(&mut self) -> std::io::Result<Vec<DeviceSample>>;
}

// ─── Platform Provider Wrappers ───────────────────────────────────────

#[cfg(target_os = "linux")]
struct OsProvider(linux::ProcDiskStatsProvider);

#[cfg(target_os = "linux")]
impl DiskIoProvider for OsProvider {
    fn sample(&mut self) -> std::io::Result<Vec<DeviceSample>> {
        self.0.sample()
    }
}

#[cfg(target_os = "freebsd")]
struct OsProvider(freebsd::DevstatProvider);

#[cfg(target_os = "freebsd")]
impl DiskIoProvider for OsProvider {
    fn sample(&mut self) -> std::io::Result<Vec<DeviceSample>> {
        self.0.sample()
    }
}

#[cfg(target_os = "macos")]
struct OsProvider(macos::IOKitProvider);

#[cfg(target_os = "macos")]
impl DiskIoProvider for OsProvider {
    fn sample(&mut self) -> std::io::Result<Vec<DeviceSample>> {
        self.0.sample()
    }
}

#[cfg(target_os = "windows")]
struct OsProvider(windows::PdhDiskProvider);

#[cfg(target_os = "windows")]
impl DiskIoProvider for OsProvider {
    fn sample(&mut self) -> std::io::Result<Vec<DeviceSample>> {
        self.0.sample()
    }
}

// ─── Factory ──────────────────────────────────────────────────────────

/// Auto-detect the OS and create the most appropriate `DiskIoProvider`.
#[cfg(not(any(target_os = "linux", target_os = "freebsd", target_os = "macos", target_os = "windows")))]
fn create_provider() -> std::io::Result<Box<dyn DiskIoProvider>> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "Disk I/O monitoring not supported on this platform",
    ))
}

#[cfg(target_os = "linux")]
fn create_provider() -> std::io::Result<Box<dyn DiskIoProvider>> {
    if let Some(p) = linux::ProcDiskStatsProvider::new() {
        return Ok(Box::new(OsProvider(p)));
    }
    // Fallback to CLI
    if let Some(p) = fallback::CliFallbackProvider::new() {
        return Ok(Box::new(p));
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "No disk I/O provider available on Linux",
    ))
}

#[cfg(target_os = "freebsd")]
fn create_provider() -> std::io::Result<Box<dyn DiskIoProvider>> {
    if let Some(p) = freebsd::DevstatProvider::new() {
        return Ok(Box::new(OsProvider(p)));
    }
    if let Some(p) = fallback::CliFallbackProvider::new() {
        return Ok(Box::new(p));
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "No disk I/O provider available on FreeBSD",
    ))
}

#[cfg(target_os = "macos")]
fn create_provider() -> std::io::Result<Box<dyn DiskIoProvider>> {
    if let Some(p) = macos::IOKitProvider::new() {
        return Ok(Box::new(OsProvider(p)));
    }
    if let Some(p) = fallback::CliFallbackProvider::new() {
        return Ok(Box::new(p));
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "No disk I/O provider available on macOS",
    ))
}

#[cfg(target_os = "windows")]
fn create_provider() -> std::io::Result<Box<dyn DiskIoProvider>> {
    if let Some(p) = windows::PdhDiskProvider::new() {
        return Ok(Box::new(OsProvider(p)));
    }
    if let Some(p) = fallback::CliFallbackProvider::new() {
        return Ok(Box::new(p));
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "No disk I/O provider available on Windows",
    ))
}

// ─── Stateful Sampler ─────────────────────────────────────────────────

/// Holds a previous snapshot and computes throughput deltas.
///
/// Usage:
/// ```ignore
/// let mut sampler = ThroughputSampler::new()?;
/// loop {
///     std::thread::sleep(Duration::from_secs(1));
///     for t in sampler.sample()? {
///         println!("{}: {:.2} MB/s", t.device, t.total_bytes_per_sec / 1_048_576.0);
///     }
/// }
/// ```
pub struct ThroughputSampler {
    provider: Box<dyn DiskIoProvider>,
    prev: Vec<DeviceSample>,
    sample_time: Instant,
}

impl ThroughputSampler {
    /// Create a new sampler with auto-detected OS provider.
    pub fn new() -> std::io::Result<Self> {
        let mut provider = create_provider()?;
        let prev = provider.sample()?;
        Ok(Self { provider, prev, sample_time: Instant::now() })
    }

    /// Create a sampler with an explicit provider (for testing or fallback).
    pub fn with_provider(mut provider: Box<dyn DiskIoProvider>) -> Self {
        let prev = provider.sample().unwrap_or_default();
        Self { provider, prev, sample_time: Instant::now() }
    }

    /// Sample current counters and compute throughput since the last call.
    ///
    /// The returned `Throughput` values reflect the average rate over the
    /// elapsed time between this call and the previous `sample()` call (or
    /// construction). Call at regular intervals (e.g., every 1 second).
    pub fn sample(&mut self) -> std::io::Result<Vec<Throughput>> {
        let now = Instant::now();
        let wall_elapsed_ns = now.duration_since(self.sample_time).as_nanos().max(1) as u64;
        let curr = self.provider.sample()?;

        // Build lookup: name → current sample
        let curr_map: HashMap<&str, &DeviceSample> =
            curr.iter().map(|s| (s.name.as_str(), s)).collect();

        let mut results = Vec::with_capacity(self.prev.len());
        for prev_sample in &self.prev {
            if let Some(curr_sample) = curr_map.get(prev_sample.name.as_str()) {
                results.push(Throughput::compute(
                    prev_sample.name.clone(),
                    prev_sample,
                    curr_sample,
                    wall_elapsed_ns,
                ));
            }
        }

        self.prev = curr;
        self.sample_time = now;
        Ok(results)
    }

    /// Reset the baseline snapshot without computing throughput.
    pub fn reset(&mut self) -> std::io::Result<()> {
        self.prev = self.provider.sample()?;
        self.sample_time = Instant::now();
        Ok(())
    }
}

// ─── Dummy Provider (fallback when OS is unsupported) ──────────────────

pub struct DummyProvider;

impl DummyProvider {
    pub fn new() -> Self {
        Self
    }
}

impl DiskIoProvider for DummyProvider {
    fn sample(&mut self) -> std::io::Result<Vec<DeviceSample>> {
        Ok(Vec::new())
    }
}

// ─── Disk Speed Cache (time-based throttling) ────────────────────────

/// Time-based cache for disk I/O speed measurements.
///
/// Ensures [`ThroughputSampler::sample`] is called at most once per
/// [`MIN_DISK_SPEED_INTERVAL`] to avoid excessive kernel-level reads.
/// Intermediate calls return the last cached value.
pub struct DiskSpeedCache {
    last_sample: Instant,
    last_speed: Option<f64>,
}

const MIN_DISK_SPEED_INTERVAL: Duration = Duration::from_secs(1);

impl DiskSpeedCache {
    pub fn new() -> Self {
        Self {
            last_sample: Instant::now(),
            last_speed: None,
        }
    }

    /// Return the current total disk throughput (bytes/sec), sampling at most
    /// once per [`MIN_DISK_SPEED_INTERVAL`].
    pub fn get(&mut self, sampler: &mut ThroughputSampler) -> Option<f64> {
        if self.last_sample.elapsed() < MIN_DISK_SPEED_INTERVAL {
            return self.last_speed;
        }
        let total = sampler.sample().ok().map(|samples| {
            samples.iter().map(|t| t.total_bytes_per_sec).sum::<f64>()
        }).filter(|&v| v > 0.0);
        self.last_speed = total;
        self.last_sample = Instant::now();
        total
    }
}

// ─── Tauri Command ────────────────────────────────────────────────────

/// Tauri command: returns current disk I/O throughput for all devices.
///
/// The frontend should call this at regular intervals (e.g., every 1-2s).
#[tauri::command]
pub fn sample_disk_io(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<Vec<Throughput>, String> {
    let mut sampler = state.disk_io_sampler.lock().map_err(|e| e.to_string())?;
    sampler.sample().map_err(|e| e.to_string())
}
