use std::ffi::CString;

use super::types::DeviceSample;

/// Provider using IOKit's IOBlockStorageDriver "Statistics" dictionary.
///
/// Walks the I/O Registry from IOMedia → parent IOBlockStorageDriver,
/// reads the cumulative byte/operation/time counters from the
/// "Statistics" property dictionary.
pub struct IOKitProvider;

// IOKit / CoreFoundation constants
const KIO_MASTER_PORT_DEFAULT: *mut libc::c_void = std::ptr::null_mut();
const KIOSERVICE_PLANE: &[u8] = b"IOService\0";
const KIO_BSD_NAME_KEY: &[u8] = b"BSD Name\0";
const KIO_BLOCK_STORAGE_DRIVER_STATISTICS_KEY: &[u8] = b"Statistics\0";
const KIO_BLOCK_STORAGE_DRIVER_STATISTICS_BYTES_READ_KEY: &[u8] = b"Bytes (Read)\0";
const KIO_BLOCK_STORAGE_DRIVER_STATISTICS_BYTES_WRITTEN_KEY: &[u8] = b"Bytes (Write)\0";
const KIO_BLOCK_STORAGE_DRIVER_STATISTICS_READS_KEY: &[u8] = b"Operations (Read)\0";
const KIO_BLOCK_STORAGE_DRIVER_STATISTICS_WRITES_KEY: &[u8] = b"Operations (Write)\0";
const KIO_BLOCK_STORAGE_DRIVER_STATISTICS_TOTAL_READ_TIME_KEY: &[u8] = b"Total Time (Read)\0";
const KIO_BLOCK_STORAGE_DRIVER_STATISTICS_TOTAL_WRITE_TIME_KEY: &[u8] = b"Total Time (Write)\0";

impl IOKitProvider {
    pub fn new() -> Option<Self> {
        Some(Self)
    }

    pub fn sample(&mut self) -> std::io::Result<Vec<DeviceSample>> {
        unsafe { self.sample_inner() }
    }

    unsafe fn sample_inner(&self) -> std::io::Result<Vec<DeviceSample>> {
        use core_foundation_sys::base::{
            CFAllocatorRef, CFRelease, CFTypeRef, kCFAllocatorDefault,
        };
        use core_foundation_sys::dictionary::CFDictionaryGetValue;
        use core_foundation_sys::number::{
            CFNumberGetValue, CFNumberRef, kCFNumberSInt64Type,
        };
        use core_foundation_sys::string::{
            CFSTR, CFStringGetCString, CFStringRef, kCFStringEncodingUTF8,
        };
        use io_kit_sys::*;

        let mut devices = Vec::new();

        // 1. Get all IOBlockStorageDriver services
        let matching = IOServiceMatching(b"IOBlockStorageDriver\0".as_ptr() as *const libc::c_char);
        if matching.is_null() {
            return Ok(devices);
        }

        let mut drive_iter: io_object_t = 0;
        let kr = IOServiceGetMatchingServices(
            KIO_MASTER_PORT_DEFAULT,
            matching,
            &mut drive_iter,
        );
        if kr != 0 || drive_iter == 0 {
            return Ok(devices);
        }

        // 2. Iterate drives
        loop {
            let drive = IOIteratorNext(drive_iter);
            if drive == 0 {
                break;
            }

            // Get BSD name from the IOMedia child
            let bsd_name = self.get_bsd_name(drive);

            // Get properties from the IOBlockStorageDriver
            let mut props: CFMutableDictionaryRef = std::mem::zeroed();
            let kr = IORegistryEntryCreateCFProperties(
                drive,
                &mut props,
                kCFAllocatorDefault,
                0,
            );

            if kr == 0 && !props.is_null() {
                let stats_key = CFSTR(KIO_BLOCK_STORAGE_DRIVER_STATISTICS_KEY.as_ptr() as *const libc::c_char);
                let stats_dict = CFDictionaryGetValue(props, stats_key as *const libc::c_void) as CFDictionaryRef;

                if !stats_dict.is_null() {
                    let device_name = bsd_name.unwrap_or_else(|| format!("unknown"));
                    let sample = self.read_statistics(stats_dict, device_name);
                    devices.push(sample);
                }

                CFRelease(props as *const libc::c_void);
            }

            IOObjectRelease(drive);
        }

        IOObjectRelease(drive_iter);
        Ok(devices)
    }

    /// Walk from an IOBlockStorageDriver to its IOMedia child to get the BSD name.
    unsafe fn get_bsd_name(&self, drive: io_object_t) -> Option<String> {
        use core_foundation_sys::base::{CFRelease, kCFAllocatorDefault};
        use core_foundation_sys::string::{
            CFStringGetCString, CFStringRef, kCFStringEncodingUTF8,
        };
        use io_kit_sys::*;

        let bsd_name_key = CFSTR(KIO_BSD_NAME_KEY.as_ptr() as *const libc::c_char);

        // The IOBlockStorageDriver has IOMedia as its provider (child)
        let mut media_iter: io_iterator_t = 0;
        let kr = IORegistryEntryGetChildIterator(
            drive,
            KIOSERVICE_PLANE.as_ptr() as *const libc::c_char,
            &mut media_iter,
        );
        if kr != 0 || media_iter == 0 {
            return None;
        }

        let mut result = None;
        loop {
            let media = IOIteratorNext(media_iter);
            if media == 0 {
                break;
            }

            if IOObjectConformsTo(media, b"IOMedia\0".as_ptr() as *const libc::c_char) != 0 {
                let name_ref = IORegistryEntryCreateCFProperty(
                    media,
                    bsd_name_key,
                    kCFAllocatorDefault,
                    0,
                );

                if !name_ref.is_null() {
                    let mut buf = [0i8; 256];
                    let success = CFStringGetCString(
                        name_ref as CFStringRef,
                        buf.as_mut_ptr(),
                        buf.len() as libc::c_long,
                        kCFStringEncodingUTF8,
                    );
                    if success != 0 {
                        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                        result = Some(
                            buf[..len]
                                .iter()
                                .map(|&c| c as u8 as char)
                                .collect::<String>(),
                        );
                    }
                    CFRelease(name_ref as *const libc::c_void);
                }

                IOObjectRelease(media);
                break;
            }

            IOObjectRelease(media);
        }

        IOObjectRelease(media_iter);
        result
    }

    /// Extract individual statistics from the "Statistics" CFDictionary.
    unsafe fn read_statistics(
        &self,
        stats: CFDictionaryRef,
        name: String,
    ) -> DeviceSample {
        use core_foundation_sys::dictionary::CFDictionaryGetValue;
        use core_foundation_sys::number::{
            CFNumberGetValue, CFNumberRef, kCFNumberSInt64Type,
        };
        use core_foundation_sys::string::CFSTR;

        macro_rules! get_stat {
            ($key:expr) => {{
                let key = CFSTR($key.as_ptr() as *const libc::c_char);
                let num = CFDictionaryGetValue(stats, key as *const libc::c_void) as CFNumberRef;
                let mut val: i64 = 0;
                if !num.is_null() {
                    CFNumberGetValue(num, kCFNumberSInt64Type, &mut val as *mut i64 as *mut libc::c_void);
                }
                val.max(0) as u64
            }};
        }

        DeviceSample {
            name,
            read_bytes: get_stat!(KIO_BLOCK_STORAGE_DRIVER_STATISTICS_BYTES_READ_KEY),
            write_bytes: get_stat!(KIO_BLOCK_STORAGE_DRIVER_STATISTICS_BYTES_WRITTEN_KEY),
            read_ops: get_stat!(KIO_BLOCK_STORAGE_DRIVER_STATISTICS_READS_KEY),
            write_ops: get_stat!(KIO_BLOCK_STORAGE_DRIVER_STATISTICS_WRITES_KEY),
            read_time_ns: get_stat!(KIO_BLOCK_STORAGE_DRIVER_STATISTICS_TOTAL_READ_TIME_KEY),
            write_time_ns: get_stat!(KIO_BLOCK_STORAGE_DRIVER_STATISTICS_TOTAL_WRITE_TIME_KEY),
            busy_time_ns: 0, // macOS doesn't expose io_ticks directly; approximate from total time
        }
    }
}
