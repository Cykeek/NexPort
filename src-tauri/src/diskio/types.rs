use serde::Serialize;

/// Cumulative snapshot of a single block device's I/O counters from the kernel.
/// All values are monotonic counters since boot (or since device attach).
#[derive(Debug, Clone, Default)]
pub struct DeviceSample {
    pub name: String,
    pub read_bytes: u64,
    pub write_bytes: u64,
    pub read_ops: u64,
    pub write_ops: u64,
    pub read_time_ns: u64,
    pub write_time_ns: u64,
    pub busy_time_ns: u64,
}

/// Throughput and latency computed from two `DeviceSample` snapshots.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Throughput {
    pub device: String,
    pub read_bytes_per_sec: f64,
    pub write_bytes_per_sec: f64,
    pub total_bytes_per_sec: f64,
    pub read_iops: f64,
    pub write_iops: f64,
    pub avg_read_latency_ms: f64,
    pub avg_write_latency_ms: f64,
    pub io_utilization_pct: f64,
}

impl Throughput {
    /// Compute throughput between two cumulative samples.
    pub fn compute(name: String, prev: &DeviceSample, curr: &DeviceSample, wall_elapsed_ns: u64) -> Self {
        let wall_elapsed_sec = (wall_elapsed_ns as f64).max(1.0) / 1_000_000_000.0;

        let delta_read_bytes = curr.read_bytes.saturating_sub(prev.read_bytes) as f64;
        let delta_write_bytes = curr.write_bytes.saturating_sub(prev.write_bytes) as f64;
        let delta_read_ops = curr.read_ops.saturating_sub(prev.read_ops) as f64;
        let delta_write_ops = curr.write_ops.saturating_sub(prev.write_ops) as f64;
        let delta_read_time = curr.read_time_ns.saturating_sub(prev.read_time_ns) as f64;
        let delta_write_time = curr.write_time_ns.saturating_sub(prev.write_time_ns) as f64;
        let delta_busy_time = curr.busy_time_ns.saturating_sub(prev.busy_time_ns) as f64;

        Self {
            device: name,
            read_bytes_per_sec: delta_read_bytes / wall_elapsed_sec,
            write_bytes_per_sec: delta_write_bytes / wall_elapsed_sec,
            total_bytes_per_sec: (delta_read_bytes + delta_write_bytes) / wall_elapsed_sec,
            read_iops: delta_read_ops / wall_elapsed_sec,
            write_iops: delta_write_ops / wall_elapsed_sec,
            avg_read_latency_ms: if delta_read_ops > 0.0 { delta_read_time / delta_read_ops / 1_000_000.0 } else { 0.0 },
            avg_write_latency_ms: if delta_write_ops > 0.0 { delta_write_time / delta_write_ops / 1_000_000.0 } else { 0.0 },
            io_utilization_pct: ((delta_busy_time / 1_000_000_000.0) / wall_elapsed_sec * 100.0).clamp(0.0, 100.0),
        }
    }
}
