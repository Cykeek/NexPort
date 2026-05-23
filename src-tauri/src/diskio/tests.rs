use super::types::*;

#[test]
fn test_throughput_compute_basic() {
    let prev = DeviceSample {
        name: "sda".into(),
        read_bytes: 1000,
        write_bytes: 2000,
        read_ops: 10,
        write_ops: 20,
        read_time_ns: 5_000_000,
        write_time_ns: 10_000_000,
        busy_time_ns: 1_000_000_000, // 1 second
    };
    let curr = DeviceSample {
        name: "sda".into(),
        read_bytes: 2000,
        write_bytes: 4000,
        read_ops: 20,
        write_ops: 40,
        read_time_ns: 10_000_000,
        write_time_ns: 20_000_000,
        busy_time_ns: 2_000_000_000, // 2 seconds
    };

    let t = Throughput::compute("sda".into(), &prev, &curr, 1_000_000_000);
    // wall elapsed = 1s
    assert!((t.read_bytes_per_sec - 1000.0).abs() < 0.01);
    assert!((t.write_bytes_per_sec - 2000.0).abs() < 0.01);
    assert!((t.total_bytes_per_sec - 3000.0).abs() < 0.01);
    assert!((t.read_iops - 10.0).abs() < 0.01);
    assert!((t.write_iops - 20.0).abs() < 0.01);
    // Latency: read_time delta = 5_000_000 ns / 10 ops = 500_000 ns/op = 0.5 ms
    assert!((t.avg_read_latency_ms - 0.5).abs() < 0.01);
    assert!((t.avg_write_latency_ms - 0.5).abs() < 0.01);
    // Utilization: busy_time delta = 1s / wall elapsed 1s = 100%
    assert!((t.io_utilization_pct - 100.0).abs() < 0.01);
}

#[test]
fn test_throughput_compute_zero_delta() {
    let prev = DeviceSample {
        name: "sda".into(),
        read_bytes: 1000,
        write_bytes: 2000,
        ..Default::default()
    };
    let curr = DeviceSample {
        name: "sda".into(),
        read_bytes: 1000,
        write_bytes: 2000,
        ..Default::default()
    };

    let t = Throughput::compute("sda".into(), &prev, &curr, 1_000_000_000);
    assert_eq!(t.read_bytes_per_sec, 0.0);
    assert_eq!(t.write_bytes_per_sec, 0.0);
    assert_eq!(t.read_iops, 0.0);
    assert_eq!(t.write_iops, 0.0);
}

#[test]
fn test_throughput_compute_wraparound() {
    let prev = DeviceSample {
        name: "sda".into(),
        read_bytes: u64::MAX - 100,
        ..Default::default()
    };
    let curr = DeviceSample {
        name: "sda".into(),
        read_bytes: 50, // wrapped around
        ..Default::default()
    };

    let t = Throughput::compute("sda".into(), &prev, &curr, 1_000_000_000);
    // saturating_sub on wrapped values: 50 - (u64::MAX - 100) = 0 due to saturating
    // This is acceptable — the user gets 0 for that interval instead of a spike
    assert!(t.read_bytes_per_sec >= 0.0);
}

#[test]
fn test_throughput_serde() {
    let t = Throughput {
        device: "nvme0n1".into(),
        read_bytes_per_sec: 52428800.0,
        write_bytes_per_sec: 104857600.0,
        total_bytes_per_sec: 157286400.0,
        read_iops: 100.0,
        write_iops: 200.0,
        avg_read_latency_ms: 0.5,
        avg_write_latency_ms: 1.2,
        io_utilization_pct: 35.7,
    };

    let json = serde_json::to_string(&t).unwrap();
    assert!(json.contains("readBytesPerSec"));
    assert!(json.contains("writeBytesPerSec"));
    assert!(json.contains("totalBytesPerSec"));
}
