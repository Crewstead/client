//! Access-control entries for a project's capability SID. Adapted from OpenAI Codex
//! (codex-rs/windows-sandbox-rs/src/acl.rs, Apache-2.0).
//!
//! The project folder gets an inherited allow entry for the SID, so the sandboxed command may write
//! there; protected paths inside it (Git metadata) get a deny entry, which Windows checks first.
//! The entries stay after the command ends: the next command in the project needs them again.

use crate::win::{Sid, last_error, wide, wide_path};
use std::ffi::c_void;
use std::path::Path;
use std::ptr::null_mut;
use windows_sys::Win32::Foundation::{CloseHandle, ERROR_SUCCESS, INVALID_HANDLE_VALUE, LocalFree};
use windows_sys::Win32::Security::Authorization::{
    ACCESS_MODE, DENY_ACCESS, EXPLICIT_ACCESS_W, GetNamedSecurityInfoW, GetSecurityInfo,
    SE_FILE_OBJECT, SE_KERNEL_OBJECT, SET_ACCESS, SetEntriesInAclW, SetNamedSecurityInfoW,
    SetSecurityInfo, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
};
use windows_sys::Win32::Security::{
    ACCESS_ALLOWED_ACE, ACE_HEADER, ACL, ACL_SIZE_INFORMATION, AclSizeInformation,
    DACL_SECURITY_INFORMATION, DeleteAce, EqualSid, GetAce, GetAclInformation,
    PROTECTED_DACL_SECURITY_INFORMATION,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};

const FILE_GENERIC_READ: u32 = 0x0012_0089;
const FILE_GENERIC_WRITE: u32 = 0x0012_0116;
const FILE_GENERIC_EXECUTE: u32 = 0x0012_00A0;
const DELETE: u32 = 0x0001_0000;
const FILE_DELETE_CHILD: u32 = 0x40;
const INHERIT: u32 = 0x1 | 0x2; // OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE
const INHERITED_ACE: u8 = 0x10;
const ALLOWED: u8 = 0; // ACCESS_ALLOWED_ACE_TYPE
const DENIED: u8 = 1; // ACCESS_DENIED_ACE_TYPE

/// Read, write and run, and delete each file or folder itself. Not FILE_DELETE_CHILD on folders: that
/// would let a command delete a protected child (`.git`) through its parent despite the deny entry.
const WRITE_ALLOW: u32 = FILE_GENERIC_READ | FILE_GENERIC_WRITE | FILE_GENERIC_EXECUTE | DELETE;
/// Writing, appending, attributes, deleting: not READ_CONTROL or SYNCHRONIZE (in FILE_GENERIC_WRITE),
/// which reading needs too, now that the sandbox users' group is denied as well as the SID.
const WRITE_DENY: u32 = 0x2 | 0x4 | 0x10 | 0x100 | DELETE | FILE_DELETE_CHILD;

/// A path's DACL with the security descriptor that holds it, freed when dropped.
struct Dacl {
    acl: *mut ACL,
    descriptor: *mut c_void,
}

impl Drop for Dacl {
    fn drop(&mut self) {
        unsafe { LocalFree(self.descriptor) };
    }
}

fn read(path: &Path) -> Result<Dacl, String> {
    let mut dacl = Dacl {
        acl: null_mut(),
        descriptor: null_mut(),
    };
    let code = unsafe {
        GetNamedSecurityInfoW(
            wide_path(path).as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            &mut dacl.acl,
            null_mut(),
            &mut dacl.descriptor,
        )
    };
    if code != ERROR_SUCCESS {
        return Err(format!(
            "reading the permissions of {}: error {code}",
            path.display()
        ));
    }
    Ok(dacl)
}

fn write(path: &Path, acl: *mut ACL) -> Result<(), String> {
    let code = unsafe {
        SetNamedSecurityInfoW(
            wide_path(path).as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            acl,
            null_mut(),
        )
    };
    if code != ERROR_SUCCESS {
        return Err(format!(
            "changing the permissions of {}: error {code}",
            path.display()
        ));
    }
    Ok(())
}

/// The explicit (not inherited) entries of a DACL for one SID: (index, type, mask).
fn entries_for(acl: *mut ACL, sid: &Sid) -> Vec<(u32, u8, u32)> {
    let mut found = Vec::new();
    if acl.is_null() {
        return found;
    }
    let mut info: ACL_SIZE_INFORMATION = unsafe { std::mem::zeroed() };
    let size = size_of::<ACL_SIZE_INFORMATION>() as u32;
    let info_ptr = &mut info as *mut ACL_SIZE_INFORMATION as *mut c_void;
    if unsafe { GetAclInformation(acl, info_ptr, size, AclSizeInformation) } == 0 {
        return found;
    }
    for index in 0..info.AceCount {
        let mut ace: *mut c_void = null_mut();
        if unsafe { GetAce(acl, index, &mut ace) } == 0 {
            continue;
        }
        let header = unsafe { &*(ace as *const ACE_HEADER) };
        if header.AceFlags & INHERITED_ACE != 0 || header.AceType > DENIED {
            continue;
        }
        // Allowed and denied entries share this layout.
        let entry = unsafe { &*(ace as *const ACCESS_ALLOWED_ACE) };
        let entry_sid = std::ptr::addr_of!(entry.SidStart) as *mut c_void;
        if unsafe { EqualSid(entry_sid, sid.ptr()) } != 0 {
            found.push((index, header.AceType, entry.Mask));
        }
    }
    found
}

fn add(
    path: &Path,
    sid: &Sid,
    mode: ACCESS_MODE,
    mask: u32,
    inheritance: u32,
) -> Result<(), String> {
    let dacl = read(path)?;
    let kind = if mode == DENY_ACCESS { DENIED } else { ALLOWED };
    let present = entries_for(dacl.acl, sid)
        .iter()
        .any(|&(_, found, have)| found == kind && have & mask == mask);
    if present {
        return Ok(());
    }
    let entry = EXPLICIT_ACCESS_W {
        grfAccessPermissions: mask,
        grfAccessMode: mode,
        grfInheritance: inheritance,
        Trustee: trustee(sid),
    };
    let mut updated: *mut ACL = null_mut();
    let code = unsafe { SetEntriesInAclW(1, &entry, dacl.acl, &mut updated) };
    if code != ERROR_SUCCESS {
        return Err(format!("SetEntriesInAclW failed: {code}"));
    }
    let result = write(path, updated);
    unsafe { LocalFree(updated.cast()) };
    result
}

fn trustee(sid: &Sid) -> TRUSTEE_W {
    TRUSTEE_W {
        pMultipleTrustee: null_mut(),
        MultipleTrusteeOperation: 0,
        TrusteeForm: TRUSTEE_IS_SID,
        TrusteeType: TRUSTEE_IS_UNKNOWN,
        ptstrName: sid.ptr() as *mut u16,
    }
}

/// The SID may write anywhere under `path` (inherited by everything in it).
pub fn allow_write(path: &Path, sid: &Sid) -> Result<(), String> {
    add(path, sid, SET_ACCESS, WRITE_ALLOW, INHERIT)
}

/// The SID may read and run what is under `path` (programs the owner installed in their own folder).
pub fn allow_read(path: &Path, sid: &Sid) -> Result<(), String> {
    add(
        path,
        sid,
        SET_ACCESS,
        FILE_GENERIC_READ | FILE_GENERIC_EXECUTE,
        INHERIT,
    )
}

/// Only the owner, SYSTEM and administrators may open `path`; nothing is inherited from its folder.
pub fn owner_only(path: &Path, owner: &Sid) -> Result<(), String> {
    const FULL: u32 = 0x001F_01FF; // FILE_ALL_ACCESS
    let system = Sid::parse("S-1-5-18")?;
    let admins = Sid::parse("S-1-5-32-544")?;
    let entries = [owner, &system, &admins].map(|sid| EXPLICIT_ACCESS_W {
        grfAccessPermissions: FULL,
        grfAccessMode: SET_ACCESS,
        grfInheritance: 0,
        Trustee: trustee(sid),
    });
    let mut acl: *mut ACL = null_mut();
    let code = unsafe { SetEntriesInAclW(3, entries.as_ptr(), null_mut(), &mut acl) };
    if code != ERROR_SUCCESS {
        return Err(format!("SetEntriesInAclW failed: {code}"));
    }
    let code = unsafe {
        SetNamedSecurityInfoW(
            wide_path(path).as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            acl,
            null_mut(),
        )
    };
    unsafe { LocalFree(acl.cast()) };
    if code != ERROR_SUCCESS {
        return Err(format!("protecting {}: error {code}", path.display()));
    }
    Ok(())
}

/// The SID may not write, rename or delete `path` or anything in it.
pub fn deny_write(path: &Path, sid: &Sid) -> Result<(), String> {
    let inheritance = if path.is_dir() { INHERIT } else { 0 };
    add(path, sid, DENY_ACCESS, WRITE_DENY, inheritance)
}

/// Removes the SID's own entries from `path` (a deny entry from before, when a rule changed).
pub fn clear(path: &Path, sid: &Sid) -> Result<(), String> {
    let dacl = read(path)?;
    let found = entries_for(dacl.acl, sid);
    if found.is_empty() {
        return Ok(());
    }
    // Deleting from the end keeps the earlier indexes valid.
    for &(index, _, _) in found.iter().rev() {
        if unsafe { DeleteAce(dacl.acl, index) } == 0 {
            return Err(last_error("DeleteAce"));
        }
    }
    write(path, dacl.acl)
}

/// The SID may list `folder` (names and attributes, not what the files hold), on that folder alone.
/// Set on an open handle, so Windows does not walk everything below it again (a whole profile).
pub fn allow_list(folder: &Path, sid: &Sid) -> Result<(), String> {
    const LIST: u32 = 0x1 | 0x20 | 0x80 | 0x0010_0000; // list, traverse, attributes, synchronize
    const BACKUP_SEMANTICS: u32 = 0x0200_0000; // FILE_FLAG_BACKUP_SEMANTICS opens a folder
    let present = read(folder).map(|dacl| {
        entries_for(dacl.acl, sid)
            .iter()
            .any(|&(_, kind, have)| kind == ALLOWED && have & LIST == LIST)
    })?;
    if present {
        return Ok(());
    }
    let handle = unsafe {
        CreateFileW(
            wide_path(folder).as_ptr(),
            0x0002_0000 | 0x0004_0000, // READ_CONTROL | WRITE_DAC
            FILE_SHARE_READ | FILE_SHARE_WRITE | 0x4, // and FILE_SHARE_DELETE
            null_mut(),
            OPEN_EXISTING,
            BACKUP_SEMANTICS,
            null_mut(),
        )
    };
    if handle.is_null() || handle == INVALID_HANDLE_VALUE {
        return Err(last_error("CreateFileW"));
    }
    let mut dacl = Dacl {
        acl: null_mut(),
        descriptor: null_mut(),
    };
    let mut code = unsafe {
        GetSecurityInfo(
            handle,
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            &mut dacl.acl,
            null_mut(),
            &mut dacl.descriptor,
        )
    };
    if code == ERROR_SUCCESS {
        let entry = EXPLICIT_ACCESS_W {
            grfAccessPermissions: LIST,
            grfAccessMode: windows_sys::Win32::Security::Authorization::GRANT_ACCESS,
            grfInheritance: 0,
            Trustee: trustee(sid),
        };
        let mut updated: *mut ACL = null_mut();
        code = unsafe { SetEntriesInAclW(1, &entry, dacl.acl, &mut updated) };
        if code == ERROR_SUCCESS {
            code = unsafe {
                SetSecurityInfo(
                    handle,
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION,
                    null_mut(),
                    null_mut(),
                    updated,
                    null_mut(),
                )
            };
            unsafe { LocalFree(updated.cast()) };
        }
    }
    unsafe { CloseHandle(handle) };
    if code != ERROR_SUCCESS {
        return Err(format!(
            "letting the sandbox list {}: error {code}",
            folder.display()
        ));
    }
    Ok(())
}

/// Lets the sandbox open the NUL device, which commands redirect output to.
pub fn allow_null_device(sid: &Sid) {
    const READ_CONTROL_WRITE_DAC: u32 = 0x0002_0000 | 0x0004_0000;
    let device = unsafe {
        CreateFileW(
            wide(r"\\.\NUL").as_ptr(),
            READ_CONTROL_WRITE_DAC,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            null_mut(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            null_mut(),
        )
    };
    if device.is_null() || device == INVALID_HANDLE_VALUE {
        return;
    }
    let mut dacl = Dacl {
        acl: null_mut(),
        descriptor: null_mut(),
    };
    let code = unsafe {
        GetSecurityInfo(
            device,
            SE_KERNEL_OBJECT,
            DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            &mut dacl.acl,
            null_mut(),
            &mut dacl.descriptor,
        )
    };
    if code == ERROR_SUCCESS {
        let entry = EXPLICIT_ACCESS_W {
            grfAccessPermissions: FILE_GENERIC_READ | FILE_GENERIC_WRITE | FILE_GENERIC_EXECUTE,
            grfAccessMode: SET_ACCESS,
            grfInheritance: 0,
            Trustee: trustee(sid),
        };
        let mut updated: *mut ACL = null_mut();
        if unsafe { SetEntriesInAclW(1, &entry, dacl.acl, &mut updated) } == ERROR_SUCCESS {
            unsafe {
                SetSecurityInfo(
                    device,
                    SE_KERNEL_OBJECT,
                    DACL_SECURITY_INFORMATION,
                    null_mut(),
                    null_mut(),
                    updated,
                    null_mut(),
                );
                LocalFree(updated.cast());
            }
        }
    }
    unsafe { CloseHandle(device) };
}
