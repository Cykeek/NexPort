use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::time::Duration;

use super::types::DeviceSample;

/// Provider that reads disk I/O counters via the Windows PDH API.
///
/// PDH counters are already formatted as per-second rates, so this
/// provider directly returns throughput values by sampling with a 1s interval.
///
/// # Approach
/// 1. Expand `\PhysicalDisk(*)\*` wildcard to find instance names
/// 2. For each non-`_Total` instance, add read/write byte counters
/// 3. Collect two samples 1s apart
/// 4. Read formatted rate values (already per-second)
pub struct PdhDiskProvider {
    instance_names: Vec<String>,
}

#[repr(C)]
struct PdhFmtCounterValue {
    c_status: u32,
    pad: [u8; 4],
    value: PdhFmtCounterValueUnion,
}

#[repr(C)]
union PdhFmtCounterValueUnion {
    long_value: i32,
    double_value: f64,
    large_value: i64,
    _align: [u8; 8],
}

type PdhHQuery = isize;
type PdhHCounter = isize;

// PDH status codes
const ERROR_SUCCESS: u32 = 0;
const _PDH_NO_DATA: u32 = 0x800007D5;
const PDH_FMT_DOUBLE: u32 = 0x00000200;
const _PDH_FMT_LARGE: u32 = 0x00000400;

impl PdhDiskProvider {
    pub fn new() -> Option<Self> {
        let names = expand_physical_disk_instances().ok()?;
        if names.is_empty() {
            return None;
        }
        Some(Self {
            instance_names: names,
        })
    }

    /// Sample cumulative counters. Because PDH provides rate counters,
    /// we return them as DeviceSample with `read_bytes` representing
    /// the per-second rate (stored in the first sample's time window).
    /// The caller's `Throughput::compute` will use this correctly.
    pub fn sample(&mut self) -> std::io::Result<Vec<DeviceSample>> {
        unsafe { self.sample_inner() }
    }

    unsafe fn sample_inner(&self) -> std::io::Result<Vec<DeviceSample>> {
        let mut query: PdhHQuery = 0;
        let mut counters: Vec<(String, PdhHCounter, PdhHCounter)> = Vec::new();

        // Open query
        let ret = PdhOpenQueryW(std::ptr::null(), 0, &mut query);
        if ret != ERROR_SUCCESS {
            return Err(std::io::Error::new(std::io::ErrorKind::Other, "PdhOpenQuery failed"));
        }

        // Add counters for each instance
        let instance_count = self.instance_names.len().min(64); // safety limit
        for i in 0..instance_count {
            let read_path = format!(
                "\\PhysicalDisk({})\\Disk Read Bytes/sec",
                self.instance_names[i]
            );
            let write_path = format!(
                "\\PhysicalDisk({})\\Disk Write Bytes/sec",
                self.instance_names[i]
            );

            let mut read_counter: PdhHCounter = 0;
            let mut write_counter: PdhHCounter = 0;

            let read_wide: Vec<u16> = OsStr::new(&read_path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let write_wide: Vec<u16> = OsStr::new(&write_path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let r1 = PdhAddEnglishCounterW(query, read_wide.as_ptr(), 0, &mut read_counter);
            let r2 = PdhAddEnglishCounterW(query, write_wide.as_ptr(), 0, &mut write_counter);

            if r1 == ERROR_SUCCESS && r2 == ERROR_SUCCESS {
                counters.push((self.instance_names[i].clone(), read_counter, write_counter));
            }
        }

        if counters.is_empty() {
            PdhCloseQuery(query);
            return Ok(Vec::new());
        }

        // First collect (initializes baseline, may return PDH_NO_DATA)
        PdhCollectQueryData(query);

        // Wait for sampling interval
        std::thread::sleep(Duration::from_millis(1000));

        // Second collect
        PdhCollectQueryData(query);

        // Read results
        let mut devices = Vec::with_capacity(counters.len());
        for (name, read_h, write_h) in &counters {
            let mut read_val = PdhFmtCounterValue {
                c_status: 0,
                pad: [0u8; 4],
                value: PdhFmtCounterValueUnion { double_value: 0.0 },
            };
            let mut write_val = PdhFmtCounterValue {
                c_status: 0,
                pad: [0u8; 4],
                value: PdhFmtCounterValueUnion { double_value: 0.0 },
            };
            let mut _type: u32 = 0;

            let r1 = PdhGetFormattedCounterValue(
                *read_h,
                PDH_FMT_DOUBLE,
                &mut _type,
                &mut read_val,
            );
            let r2 = PdhGetFormattedCounterValue(
                *write_h,
                PDH_FMT_DOUBLE,
                &mut _type,
                &mut write_val,
            );

            let read_bytes = if r1 == ERROR_SUCCESS {
                read_val.value.double_value.max(0.0) as u64
            } else {
                0
            };
            let write_bytes = if r2 == ERROR_SUCCESS {
                write_val.value.double_value.max(0.0) as u64
            } else {
                0
            };

            // For PDH rate counters, we store them directly as DeviceSample
            // with busy_time_ns = 1_000_000_000 (1s) so Throughput::compute
            // divides by 1 second, giving the same rate.
            devices.push(DeviceSample {
                name: name.clone(),
                read_bytes,
                write_bytes,
                read_ops: 0,
                write_ops: 0,
                read_time_ns: 0,
                write_time_ns: 0,
                busy_time_ns: 1_000_000_000,
            });
        }

        PdhCloseQuery(query);
        Ok(devices)
    }
}

fn expand_physical_disk_instances() -> std::io::Result<Vec<String>> {
    unsafe {
        let wildcard: Vec<u16> = OsStr::new("\\PhysicalDisk(*)\\Disk Read Bytes/sec")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        // First call to get required buffer size
        let mut buf_size: u32 = 0;
        let _ret = PdhExpandWildCardPathW(
            std::ptr::null(),
            wildcard.as_ptr(),
            std::ptr::null_mut(),
            &mut buf_size,
            0,
        );

        if buf_size == 0 {
            return Ok(Vec::new());
        }

        let mut buf: Vec<u16> = vec![0u16; buf_size as usize];
        let ret = PdhExpandWildCardPathW(
            std::ptr::null(),
            wildcard.as_ptr(),
            buf.as_mut_ptr(),
            &mut buf_size,
            0,
        );

        if ret != ERROR_SUCCESS {
            return Ok(Vec::new());
        }

        // Parse null-terminated multi-string
        let mut instances = Vec::new();
        let mut i = 0;
        while i < buf.len() && buf[i] != 0 {
            // Path format: \PhysicalDisk(N Drive)\Counter
            let path: String = {
                let end = buf[i..].iter().position(|&c| c == 0).unwrap_or(buf.len() - i);
                String::from_utf16_lossy(&buf[i..i + end])
            };
            i += path.len() + 1;

            // Extract instance name between parentheses
            if let Some(start) = path.find('(') {
                if let Some(end) = path.find(')') {
                    let instance = &path[start + 1..end];
                    if instance != "_Total" && !instances.contains(&instance.to_string()) {
                        instances.push(instance.to_string());
                    }
                }
            }
        }

        Ok(instances)
    }
}

// ─── PDH FFI Declarations ────────────────────────────────────────────

#[link(name = "pdh")]
extern "system" {
    fn PdhOpenQueryW(
        szDataSource: *const u16,
        dwUserData: usize,
        phQuery: *mut PdhHQuery,
    ) -> u32;

    fn PdhAddEnglishCounterW(
        hQuery: PdhHQuery,
        szFullCounterPath: *const u16,
        dwUserData: usize,
        phCounter: *mut PdhHCounter,
    ) -> u32;

    fn PdhCollectQueryData(hQuery: PdhHQuery) -> u32;

    fn PdhGetFormattedCounterValue(
        hCounter: PdhHCounter,
        dwFormat: u32,
        lpdwType: *mut u32,
        pValue: *mut PdhFmtCounterValue,
    ) -> u32;

    fn PdhCloseQuery(hQuery: PdhHQuery) -> u32;

    fn PdhExpandWildCardPathW(
        szDataSource: *const u16,
        szWildCardPath: *const u16,
        mszExpandedPathList: *mut u16,
        pcchPathListLength: *mut u32,
        dwFlags: u32,
    ) -> u32;
}
