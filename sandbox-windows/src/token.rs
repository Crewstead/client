//! The restricted token a command runs with. Adapted from OpenAI Codex
//! (codex-rs/windows-sandbox-rs/src/token.rs, Apache-2.0).
//!
//! The token keeps the owner's identity for reading, but every write is checked a second time against
//! a short list of "restricting" SIDs: the project's own capability SID, the logon SID and Everyone.
//! Only folders that grant one of those may be written, so the project folder (granted to its
//! capability SID) is writable and the rest of the owner's files are not.

use crate::win::{Sid, last_error};
use std::ffi::c_void;
use std::ptr::null_mut;
use windows_sys::Win32::Foundation::{CloseHandle, ERROR_SUCCESS, HANDLE, LUID, LocalFree};
use windows_sys::Win32::Security::Authorization::{
    EXPLICIT_ACCESS_W, GRANT_ACCESS, SetEntriesInAclW, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN,
    TRUSTEE_W,
};
use windows_sys::Win32::Security::{
    ACL, AdjustTokenPrivileges, CreateRestrictedToken, GetTokenInformation, LookupPrivilegeValueW,
    SID_AND_ATTRIBUTES, SetTokenInformation, TOKEN_ADJUST_DEFAULT, TOKEN_ADJUST_PRIVILEGES,
    TOKEN_ADJUST_SESSIONID, TOKEN_ASSIGN_PRIMARY, TOKEN_DUPLICATE, TOKEN_GROUPS, TOKEN_PRIVILEGES,
    TOKEN_QUERY, TOKEN_USER, TokenDefaultDacl, TokenGroups, TokenUser,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

const DISABLE_MAX_PRIVILEGE: u32 = 0x01;
const LUA_TOKEN: u32 = 0x04;
const WRITE_RESTRICTED: u32 = 0x08;
const GENERIC_ALL: u32 = 0x1000_0000;
const READ_CONTROL: u32 = 0x0002_0000;
const SE_GROUP_LOGON_ID: u32 = 0xC000_0000;
const SE_PRIVILEGE_ENABLED: u32 = 0x2;

/// A token handle, closed when dropped.
pub struct Token(pub HANDLE);

impl Drop for Token {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

/// This process's own token, with the access needed to make a restricted copy of it.
pub fn own_token() -> Result<Token, String> {
    let access = TOKEN_DUPLICATE
        | TOKEN_QUERY
        | TOKEN_ASSIGN_PRIMARY
        | TOKEN_ADJUST_DEFAULT
        | TOKEN_ADJUST_SESSIONID
        | TOKEN_ADJUST_PRIVILEGES;
    let mut token: HANDLE = null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), access, &mut token) } == 0 {
        return Err(last_error("OpenProcessToken"));
    }
    Ok(Token(token))
}

/// The logon SID of a token: the one group that marks this sign-in session.
pub fn logon_sid(token: &Token) -> Result<Sid, String> {
    let mut needed = 0u32;
    unsafe { GetTokenInformation(token.0, TokenGroups, null_mut(), 0, &mut needed) };
    if needed == 0 {
        return Err(last_error("GetTokenInformation(TokenGroups)"));
    }
    // u64 words keep the buffer aligned for TOKEN_GROUPS.
    let mut buffer = vec![0u64; (needed as usize).div_ceil(8)];
    let ok = unsafe {
        GetTokenInformation(
            token.0,
            TokenGroups,
            buffer.as_mut_ptr().cast(),
            needed,
            &mut needed,
        )
    };
    if ok == 0 {
        return Err(last_error("GetTokenInformation(TokenGroups)"));
    }
    let groups = buffer.as_ptr() as *const TOKEN_GROUPS;
    let count = unsafe { (*groups).GroupCount } as usize;
    let first = unsafe { (*groups).Groups.as_ptr() };
    for index in 0..count {
        let group = unsafe { &*first.add(index) };
        if group.Attributes & SE_GROUP_LOGON_ID == SE_GROUP_LOGON_ID {
            return Sid::copy(group.Sid);
        }
    }
    Err("the token has no logon SID".into())
}

/// Only SYSTEM may open this process or its thread from now on; its owner may read their permissions
/// and nothing else (OWNER RIGHTS takes away the owner's implicit right to change them).
pub fn protect_self() -> Result<(), String> {
    use windows_sys::Win32::Security::Authorization::{SE_KERNEL_OBJECT, SetSecurityInfo};
    use windows_sys::Win32::Security::{
        DACL_SECURITY_INFORMATION, PROTECTED_DACL_SECURITY_INFORMATION,
    };
    use windows_sys::Win32::System::Threading::GetCurrentThread;
    const ALL: u32 = 0x001F_FFFF; // PROCESS_ALL_ACCESS and THREAD_ALL_ACCESS
    let system = Sid::parse("S-1-5-18")?;
    let owner_rights = Sid::parse("S-1-3-4")?;
    let entries =
        [(&system, ALL), (&owner_rights, READ_CONTROL)].map(|(sid, access)| EXPLICIT_ACCESS_W {
            grfAccessPermissions: access,
            grfAccessMode: GRANT_ACCESS,
            grfInheritance: 0,
            Trustee: TRUSTEE_W {
                pMultipleTrustee: null_mut(),
                MultipleTrusteeOperation: 0,
                TrusteeForm: TRUSTEE_IS_SID,
                TrusteeType: TRUSTEE_IS_UNKNOWN,
                ptstrName: sid.ptr() as *mut u16,
            },
        });
    let mut dacl: *mut ACL = null_mut();
    let code = unsafe { SetEntriesInAclW(2, entries.as_ptr(), null_mut(), &mut dacl) };
    if code != ERROR_SUCCESS {
        return Err(format!("SetEntriesInAclW failed: {code}"));
    }
    let what = DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION;
    let mut result = Ok(());
    for handle in [unsafe { GetCurrentProcess() }, unsafe {
        GetCurrentThread()
    }] {
        let code = unsafe {
            SetSecurityInfo(
                handle,
                SE_KERNEL_OBJECT,
                what,
                null_mut(),
                null_mut(),
                dacl,
                null_mut(),
            )
        };
        if code != ERROR_SUCCESS {
            result = Err(format!("locking this process: error {code}"));
        }
    }
    unsafe { LocalFree(dacl.cast()) };
    result
}

/// The user a token belongs to.
pub fn user_sid(token: &Token) -> Result<Sid, String> {
    let mut buffer = vec![0u64; 16];
    let mut needed = 0u32;
    let size = (buffer.len() * 8) as u32;
    let ok = unsafe {
        GetTokenInformation(
            token.0,
            TokenUser,
            buffer.as_mut_ptr().cast(),
            size,
            &mut needed,
        )
    };
    if ok == 0 {
        return Err(last_error("GetTokenInformation(TokenUser)"));
    }
    Sid::copy(unsafe { (*(buffer.as_ptr() as *const TOKEN_USER)).User.Sid })
}

/// A restricted copy of `base` whose writes must also be allowed to one of `capabilities`, the logon
/// SID or Everyone. Privileges are dropped (all but bypass-traverse-checking) and admin groups too.
pub fn restricted(base: &Token, capabilities: &[&Sid]) -> Result<Token, String> {
    let logon = logon_sid(base)?;
    make(base, capabilities, &logon, None)
}

/// For a sandbox user. A user started with CreateProcessWithLogonW shares the owner's logon SID
/// (Codex notes this too), which opens the owner's processes and desktop: here it only ever denies,
/// and objects the command makes are the sandbox user's. Offline, writes must also be allowed to the
/// project's capability SID, so a command cannot write in another project. With network, the token
/// has no restricting SIDs: Windows' TLS (schannel, through LSA) refuses any restricted token, and
/// the network would be of little use without it (tried on CI, 2026-11-27).
pub fn for_sandbox_user(base: &Token, capability: &Sid, network: bool) -> Result<Token, String> {
    let (logon, user) = (logon_sid(base)?, user_sid(base)?);
    let capabilities: &[&Sid] = if network { &[] } else { &[capability, &user] };
    make(base, capabilities, &user, Some(&logon))
}

/// `owner_of_objects` gets the default DACL; `deny_only`, when given, becomes deny-only.
fn make(
    base: &Token,
    capabilities: &[&Sid],
    owner_of_objects: &Sid,
    deny_only: Option<&Sid>,
) -> Result<Token, String> {
    let everyone = Sid::parse("S-1-1-0")?;
    let restricting = capabilities
        .iter()
        .copied()
        .chain(deny_only.is_none().then_some(owner_of_objects))
        .chain([&everyone]);
    // No capabilities: no restricting SIDs at all, only what `deny_only` takes away.
    let mut entries: Vec<SID_AND_ATTRIBUTES> = restricting
        .filter(|_| !capabilities.is_empty())
        .map(|sid| SID_AND_ATTRIBUTES {
            Sid: sid.ptr(),
            Attributes: 0,
        })
        .collect();
    let flags = DISABLE_MAX_PRIVILEGE
        | LUA_TOKEN
        | if entries.is_empty() {
            0
        } else {
            WRITE_RESTRICTED
        };
    let mut disabled: Vec<SID_AND_ATTRIBUTES> = deny_only
        .iter()
        .map(|sid| SID_AND_ATTRIBUTES {
            Sid: sid.ptr(),
            Attributes: 0,
        })
        .collect();
    let mut token: HANDLE = null_mut();
    let ok = unsafe {
        CreateRestrictedToken(
            base.0,
            flags,
            disabled.len() as u32,
            if disabled.is_empty() {
                null_mut()
            } else {
                disabled.as_mut_ptr()
            },
            0,
            null_mut(),
            entries.len() as u32,
            if entries.is_empty() {
                null_mut()
            } else {
                entries.as_mut_ptr()
            },
            &mut token,
        )
    };
    if ok == 0 {
        return Err(last_error("CreateRestrictedToken"));
    }
    let token = Token(token);
    // Objects the command creates (its processes, threads, pipes) are open to this sign-in (or this
    // sandbox user) only, so capability SIDs shared with other launches give no way into them.
    default_dacl(&token, owner_of_objects)?;
    enable_privilege(&token, "SeChangeNotifyPrivilege")?;
    Ok(token)
}

fn default_dacl(token: &Token, logon: &Sid) -> Result<(), String> {
    let owner_rights = Sid::parse("S-1-3-4")?;
    let entries = [(logon, GENERIC_ALL), (&owner_rights, READ_CONTROL)].map(|(sid, access)| {
        EXPLICIT_ACCESS_W {
            grfAccessPermissions: access,
            grfAccessMode: GRANT_ACCESS,
            grfInheritance: 0,
            Trustee: TRUSTEE_W {
                pMultipleTrustee: null_mut(),
                MultipleTrusteeOperation: 0,
                TrusteeForm: TRUSTEE_IS_SID,
                TrusteeType: TRUSTEE_IS_UNKNOWN,
                ptstrName: sid.ptr() as *mut u16,
            },
        }
    });
    let mut dacl: *mut ACL = null_mut();
    let code = unsafe { SetEntriesInAclW(2, entries.as_ptr(), null_mut(), &mut dacl) };
    if code != ERROR_SUCCESS {
        return Err(format!("SetEntriesInAclW failed: {code}"));
    }
    let mut info = dacl;
    let ok = unsafe {
        SetTokenInformation(
            token.0,
            TokenDefaultDacl,
            &mut info as *mut *mut ACL as *mut c_void,
            size_of::<*mut ACL>() as u32,
        )
    };
    let error = (ok == 0).then(|| last_error("SetTokenInformation(TokenDefaultDacl)"));
    unsafe { LocalFree(dacl.cast()) };
    error.map_or(Ok(()), Err)
}

fn enable_privilege(token: &Token, name: &str) -> Result<(), String> {
    let mut luid = LUID {
        LowPart: 0,
        HighPart: 0,
    };
    let wide = crate::win::wide(name);
    if unsafe { LookupPrivilegeValueW(null_mut(), wide.as_ptr(), &mut luid) } == 0 {
        return Err(last_error("LookupPrivilegeValueW"));
    }
    let mut privileges: TOKEN_PRIVILEGES = unsafe { std::mem::zeroed() };
    privileges.PrivilegeCount = 1;
    privileges.Privileges[0].Luid = luid;
    privileges.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED;
    let ok = unsafe { AdjustTokenPrivileges(token.0, 0, &privileges, 0, null_mut(), null_mut()) };
    if ok == 0 {
        return Err(last_error("AdjustTokenPrivileges"));
    }
    // It succeeds without enabling a privilege the token lacks; that error says so.
    const ERROR_NOT_ALL_ASSIGNED: u32 = 1300;
    if unsafe { windows_sys::Win32::Foundation::GetLastError() } == ERROR_NOT_ALL_ASSIGNED {
        return Err(format!("the token has no {name}"));
    }
    Ok(())
}
