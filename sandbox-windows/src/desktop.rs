//! A private desktop for the command. Adapted from OpenAI Codex
//! (codex-rs/windows-sandbox-rs/src/desktop.rs, Apache-2.0).
//!
//! Windows on the owner's own desktop accept messages from any program of the same user at the same
//! level, so a sandboxed command there could type into the owner's terminal or click their buttons.
//! On its own desktop it sees none of their windows, and any window it opens stays invisible. The
//! owner's user may manage the desktop; the command may only use it, never change who else may.
//!
//! A sandbox user's command also gets a window station of its own (as Chromium's sandbox does): its
//! own clipboard and atoms, and no change to the owner's window station.

use crate::win::{Sid, last_error, sid_text, wide};
use std::ffi::c_void;
use std::ptr::null_mut;
use std::time::{SystemTime, UNIX_EPOCH};
use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW;
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::System::StationsAndDesktops::{
    CloseDesktop, CloseWindowStation, CreateDesktopW, CreateWindowStationW,
    GetProcessWindowStation, GetUserObjectInformationW, HDESK, HWINSTA, SetProcessWindowStation,
    UOI_NAME,
};

const DESKTOP_ALL_ACCESS: u32 = 0x000F_01FF;
const WINSTA_ALL_ACCESS: u32 = 0x000F_037F;
/// Everything but changing its permissions or owner, or deleting it.
const NOT_MANAGING: u32 = !(0x0004_0000 | 0x0008_0000 | 0x0001_0000);

/// A desktop that exists while this value lives (and while the command's processes use it).
pub struct Desktop {
    handle: HDESK,
    /// The window station made for it, if any.
    station: Option<HWINSTA>,
    /// "station\desktop", for a process's startup information.
    pub path: String,
    pub startup_name: Vec<u16>,
}

/// The name of this process's window station ("WinSta0" when signed in at the screen).
fn station_name() -> Result<String, String> {
    let mut name = vec![0u16; 256];
    let mut needed = 0u32;
    let ok = unsafe {
        GetUserObjectInformationW(
            GetProcessWindowStation(),
            UOI_NAME,
            name.as_mut_ptr().cast(),
            (name.len() * 2) as u32,
            &mut needed,
        )
    };
    if ok == 0 {
        return Err(last_error("GetUserObjectInformationW"));
    }
    let length = name.iter().position(|&c| c == 0).unwrap_or(name.len());
    Ok(String::from_utf16_lossy(&name[..length]))
}

/// A security descriptor where `owner` has `all` and each participant all of it but managing it.
struct Descriptor(*mut c_void);

impl Descriptor {
    fn new(all: u32, owner: &Sid, participants: &[&Sid]) -> Result<Descriptor, String> {
        let mut sddl = format!("D:P(A;;0x{all:x};;;{})", sid_text(owner.ptr())?);
        for sid in participants {
            let use_only = all & NOT_MANAGING;
            sddl += &format!("(A;;0x{use_only:x};;;{})", sid_text(sid.ptr())?);
        }
        let mut descriptor: *mut c_void = null_mut();
        let ok = unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                wide(&sddl).as_ptr(),
                1,
                &mut descriptor,
                null_mut(),
            )
        };
        if ok == 0 {
            return Err(last_error(
                "ConvertStringSecurityDescriptorToSecurityDescriptorW",
            ));
        }
        Ok(Descriptor(descriptor))
    }

    fn attributes(&self) -> SECURITY_ATTRIBUTES {
        SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: self.0,
            bInheritHandle: 0,
        }
    }
}

impl Drop for Descriptor {
    fn drop(&mut self) {
        unsafe { LocalFree(self.0) };
    }
}

fn unique(kind: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |time| time.as_nanos());
    format!("CrewsteadSandbox{kind}-{:x}-{nanos:x}", std::process::id())
}

impl Desktop {
    /// A new desktop in this process's window station, which `owner` (a user SID) manages and
    /// `participants` may use.
    pub fn create(owner: &Sid, participants: &[&Sid]) -> Result<Desktop, String> {
        let name = unique("Desktop");
        let descriptor = Descriptor::new(DESKTOP_ALL_ACCESS, owner, participants)?;
        let handle = unsafe {
            CreateDesktopW(
                wide(&name).as_ptr(),
                null_mut(),
                null_mut(),
                0,
                DESKTOP_ALL_ACCESS,
                &descriptor.attributes(),
            )
        };
        if handle.is_null() {
            return Err(last_error("CreateDesktopW"));
        }
        let path = format!("{}\\{name}", station_name()?);
        Ok(Desktop {
            handle,
            station: None,
            startup_name: wide(&path),
            path,
        })
    }

    /// A new window station with a desktop in it, for `user`'s commands: theirs to use, the owner's
    /// to manage.
    pub fn create_apart(owner: &Sid, user: &Sid) -> Result<Desktop, String> {
        let descriptor = Descriptor::new(WINSTA_ALL_ACCESS, owner, &[user])?;
        let station = unsafe {
            CreateWindowStationW(
                wide(unique("Station")).as_ptr(),
                0,
                WINSTA_ALL_ACCESS,
                &descriptor.attributes(),
            )
        };
        if station.is_null() {
            return Err(last_error("CreateWindowStationW"));
        }
        // A desktop is made in this process's own window station: switch to the new one meanwhile.
        let own = unsafe { GetProcessWindowStation() };
        if unsafe { SetProcessWindowStation(station) } == 0 {
            let error = last_error("SetProcessWindowStation");
            unsafe { CloseWindowStation(station) };
            return Err(error);
        }
        let desktop = Desktop::create(owner, &[user]);
        unsafe { SetProcessWindowStation(own) };
        match desktop {
            Ok(mut desktop) => {
                desktop.station = Some(station);
                Ok(desktop)
            }
            Err(error) => {
                unsafe { CloseWindowStation(station) };
                Err(error)
            }
        }
    }
}

impl Drop for Desktop {
    fn drop(&mut self) {
        unsafe { CloseDesktop(self.handle) };
        if let Some(station) = self.station {
            unsafe { CloseWindowStation(station) };
        }
    }
}
