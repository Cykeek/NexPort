use std::mem;
use std::time::Duration;

use super::types::DeviceSample;

/// Provider that reads `kern.devstat.all` via sysctl and parses
/// the binary blob as an array of `libc::devstat` structures.
pub struct DevstatProvider;

impl DevstatProvider {
    pub fn new() -> Option<Self> {
        // Probe: try reading the sysctl to see if it's available
        let mib = [libc::CTL_KERN, libc::KERN_DEVSTAT, libc::DEVSTAT_ALL];
        let mut len: usize = 0;
        let ret = unsafe {
            libc::sysctl(
                mib.as_ptr(),
                mib.len() as u32,
                std::ptr::null_mut(),
                &mut len,
                std::ptr::null(),
                0,
            )
        };
        if ret == 0 && len > 8 {
            Some(Self)
        } else {
            None
        }
    }

    pub fn sample(&mut self) -> std::io::Result<Vec<DeviceSample>> {
        let mib = [libc::CTL_KERN, libc::KERN_DEVSTAT, libc::DEVSTAT_ALL];
        let mut len: usize = 0;

        // Get buffer size
        let ret = unsafe {
            libc::sysctl(
                mib.as_ptr(),
                mib.len() as u32,
                std::ptr::null_mut(),
                &mut len,
                std::ptr::null(),
                0,
            )
        };
        if ret != 0 {
            return Err(std::io::Error::last_os_error());
        }

        let mut buf: Vec<u8> = vec![0u8; len];
        let ret = unsafe {
            libc::sysctl(
                mib.as_ptr(),
                mib.len() as u32,
                buf.as_mut_ptr() as *mut libc::c_void,
                &mut len,
                std::ptr::null(),
                0,
            )
        };
        if ret != 0 {
            return Err(std::io::Error::last_os_error());
        }

        // Skip 8-byte generation number at the head
        let data = &buf[8..];
        let devstat_size = mem::size_of::<libc::devstat>();
        let count = data.len() / devstat_size;

        let mut devices = Vec::with_capacity(count);

        for i in 0..count {
            let offset = i * devstat_size;
            let ds: libc::devstat = unsafe { std::ptr::read_unaligned(data[offset..].as_ptr() as *const libc::devstat) };

            // Skip non-physical devices
            let name = unsafe { c_char_array_to_string(&ds.device_name) };
            if name.starts_with("pass") || name.starts_with("cd") {
                continue;
            }

            let full_name = format!("{}{}", name, ds.unit_number);

            let bintime_to_ns = |bt: &libc::bintime| -> u64 {
                let sec = bt.sec.max(0) as u64;
                let frac_ns = (bt.frac as f64 * 5.421010862427522e-20 * 1_000_000_000.0)
                    .clamp(0.0, u64::MAX as f64) as u64;
                sec * 1_000_000_000 + frac_ns
            };

            devices.push(DeviceSample {
                name: full_name,
                read_bytes: ds.bytes[libc::DEVSTAT_READ as usize],
                write_bytes: ds.bytes[libc::DEVSTAT_WRITE as usize],
                read_ops: ds.operations[libc::DEVSTAT_READ as usize],
                write_ops: ds.operations[libc::DEVSTAT_WRITE as usize],
                read_time_ns: bintime_to_ns(&ds.duration[libc::DEVSTAT_READ as usize]),
                write_time_ns: bintime_to_ns(&ds.duration[libc::DEVSTAT_WRITE as usize]),
                busy_time_ns: bintime_to_ns(&ds.busy_time),
            });
        }

        Ok(devices)
    }
}

unsafe fn c_char_array_to_string(arr: &[libc::c_char]) -> String {
    let bytes: Vec<u8> = arr
        .iter()
        .take_while(|&&c| c != 0)
        .map(|&c| c as u8)
        .collect();
    String::from_utf8_lossy(&bytes).to_string()
}
