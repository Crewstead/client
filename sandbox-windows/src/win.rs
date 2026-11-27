//! Small Windows helpers: SIDs, wide strings, errors and command lines.

use std::ffi::c_void;
use std::path::Path;
use std::ptr::null_mut;
use windows_sys::Win32::Foundation::{GetLastError, LocalFree};
use windows_sys::Win32::Security::Authorization::{ConvertSidToStringSidW, ConvertStringSidToSidW};
use windows_sys::Win32::Security::{CopySid, GetLengthSid, IsValidSid};

/// A SID this program owns, as bytes.
pub struct Sid(Vec<u8>);

impl Sid {
    /// From its text form, such as "S-1-1-0".
    pub fn parse(text: &str) -> Result<Sid, String> {
        let mut raw: *mut c_void = null_mut();
        let wide = wide(text);
        if unsafe { ConvertStringSidToSidW(wide.as_ptr(), &mut raw) } == 0 {
            return Err(format!("not a valid SID: {text}"));
        }
        let sid = Sid::copy(raw);
        unsafe { LocalFree(raw) };
        sid
    }

    /// A copy of a SID Windows handed out.
    pub fn copy(raw: *mut c_void) -> Result<Sid, String> {
        if unsafe { IsValidSid(raw) } == 0 {
            return Err("not a valid SID".into());
        }
        let length = unsafe { GetLengthSid(raw) };
        let mut bytes = vec![0u8; length as usize];
        if unsafe { CopySid(length, bytes.as_mut_ptr().cast(), raw) } == 0 {
            return Err(last_error("CopySid"));
        }
        Ok(Sid(bytes))
    }

    pub fn ptr(&self) -> *mut c_void {
        self.0.as_ptr() as *mut c_void
    }
}

/// A SID's text form ("S-1-5-21-…").
pub fn sid_text(raw: *mut c_void) -> Result<String, String> {
    let mut text: *mut u16 = null_mut();
    if unsafe { ConvertSidToStringSidW(raw, &mut text) } == 0 {
        return Err(last_error("ConvertSidToStringSidW"));
    }
    let length = (0..)
        .take_while(|&at| unsafe { *text.add(at) } != 0)
        .count();
    let result = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(text, length) });
    unsafe { LocalFree(text.cast()) };
    Ok(result)
}

/// With CREWSTEAD_SANDBOX_TRACE=1, each step and the time since this program started, on stderr:
/// where a command that never starts got stuck.
pub fn trace(step: &str) {
    use std::sync::OnceLock;
    use std::time::Instant;
    static START: OnceLock<Instant> = OnceLock::new();
    let start = START.get_or_init(Instant::now);
    if std::env::var_os("CREWSTEAD_SANDBOX_TRACE").is_some_and(|value| value == "1") {
        eprintln!(
            "[sandbox {} ms, pid {}] {step}",
            start.elapsed().as_millis(),
            std::process::id()
        );
    }
}

/// A NUL-terminated UTF-16 string for Windows calls.
pub fn wide(text: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    text.as_ref().encode_wide().chain([0]).collect()
}

pub fn wide_path(path: &Path) -> Vec<u16> {
    wide(path.as_os_str())
}

/// The last Windows error, named after the call that failed.
pub fn last_error(call: &str) -> String {
    let code = unsafe { GetLastError() };
    format!(
        "{call} failed: {}",
        std::io::Error::from_raw_os_error(code as i32)
    )
}

/// One argument quoted the way programs split their command line (the C runtime's rules).
/// From OpenAI Codex (codex-rs/windows-sandbox-rs/src/winutil.rs, Apache-2.0).
pub fn quote(arg: &str) -> String {
    let plain = !arg.is_empty()
        && !arg
            .chars()
            .any(|c| matches!(c, ' ' | '\t' | '\n' | '\r' | '"'));
    if plain {
        return arg.to_string();
    }
    let mut quoted = String::from('"');
    let mut backslashes = 0;
    for ch in arg.chars() {
        match ch {
            '\\' => backslashes += 1,
            '"' => {
                quoted.push_str(&"\\".repeat(backslashes * 2 + 1));
                quoted.push('"');
                backslashes = 0;
            }
            _ => {
                quoted.push_str(&"\\".repeat(backslashes));
                backslashes = 0;
                quoted.push(ch);
            }
        }
    }
    quoted.push_str(&"\\".repeat(backslashes * 2));
    quoted.push('"');
    quoted
}

/// A program and its arguments as one Windows command line.
pub fn command_line(argv: &[String]) -> String {
    argv.iter()
        .map(|arg| quote(arg))
        .collect::<Vec<_>>()
        .join(" ")
}
