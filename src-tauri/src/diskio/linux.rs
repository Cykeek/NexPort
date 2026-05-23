use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use super::types::DeviceSample;

/// Provider that reads `/proc/diskstats` (kernel 5.5+ format).
///
/// Fields (0-indexed):
///   0  major
///   1  minor
///   2  name
///   3  reads_completed
///   4  reads_merged
///   5  sectors_read
///   6  read_ticks (ms)
///   7  writes_completed
///   8  writes_merged
///   9  sectors_written
///  10  write_ticks (ms)
///  11  in_flight
///  12  io_ticks (ms)
///  13  time_in_queue (ms)
///  14  discards_completed     (kernel 4.18+)
///  15  discards_merged
///  16  sectors_discarded
///  17  discard_ticks
///  18  flush_completed        (kernel 5.5+)
///  19  flush_ticks
pub struct ProcDiskStatsProvider;

impl ProcDiskStatsProvider {
    pub fn new() -> Option<Self> {
        if Path::new("/proc/diskstats").exists() {
            Some(Self)
        } else {
            None
        }
    }

    pub fn sample(&mut self) -> std::io::Result<Vec<DeviceSample>> {
        let file = File::open("/proc/diskstats")?;
        let reader = BufReader::new(file);
        let mut devices = Vec::new();

        for line in reader.lines() {
            let line = line?;
            if let Some(sample) = parse_line(&line) {
                devices.push(sample);
            }
        }

        Ok(devices)
    }
}

fn parse_line(line: &str) -> Option<DeviceSample> {
    let mut fields = line.split_whitespace();

    let _major: u32 = fields.next()?.parse().ok()?;
    let _minor: u32 = fields.next()?.parse().ok()?;
    let name = fields.next()?;

    // Skip virtual / special devices
    if name.starts_with("ram")
        || name.starts_with("loop")
        || name.starts_with("zram")
        || name.starts_with("dm-")
        || name.starts_with("md")
    {
        return None;
    }

    let rest: Vec<u64> = fields.filter_map(|f| f.parse().ok()).collect();
    if rest.len() < 11 {
        return None;
    }

    Some(DeviceSample {
        name: name.to_string(),
        read_bytes: rest[2].wrapping_mul(512),
        write_bytes: rest[7].wrapping_mul(512),
        read_ops: rest[0],
        write_ops: rest[4],
        read_time_ns: rest[3].wrapping_mul(1_000_000),
        write_time_ns: rest[8].wrapping_mul(1_000_000),
        busy_time_ns: rest[9].wrapping_mul(1_000_000),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_line() {
        let line = "   8       0 sda 1000 50 50000 200 2000 30 100000 400 0 600 700";
        let sample = parse_line(line).unwrap();
        assert_eq!(sample.name, "sda");
        assert_eq!(sample.read_bytes, 50000 * 512);
        assert_eq!(sample.write_bytes, 100000 * 512);
        assert_eq!(sample.read_ops, 1000);
        assert_eq!(sample.write_ops, 2000);
        assert_eq!(sample.read_time_ns, 200 * 1_000_000);
        assert_eq!(sample.write_time_ns, 400 * 1_000_000);
        assert_eq!(sample.busy_time_ns, 600 * 1_000_000);
    }

    #[test]
    fn test_skip_virtual() {
        assert!(parse_line("   7       0 loop0 0 0 0 0 0 0 0 0 0 0 0").is_none());
        assert!(parse_line("   1       0 ram0 0 0 0 0 0 0 0 0 0 0 0").is_none());
        assert!(parse_line(" 252       0 dm-0 0 0 0 0 0 0 0 0 0 0 0").is_none());
    }

    #[test]
    fn test_parse_nvme() {
        let line = " 259       0 nvme0n1 255999 814 12369153 47919 996852 81 36123024 425995 0 301795 580470 0 0 0 0 60602 106555";
        let sample = parse_line(line).unwrap();
        assert_eq!(sample.name, "nvme0n1");
        assert_eq!(sample.read_bytes, 12369153 * 512);
        assert_eq!(sample.write_bytes, 36123024 * 512);
    }
}
