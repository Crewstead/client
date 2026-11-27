//! The sandbox users' passwords, encrypted with Windows' DPAPI for this computer, in a file only the
//! owner (and administrators) may open. As OpenAI Codex keeps them (setup.rs, dpapi.rs; Apache-2.0).

use crate::win::{Sid, last_error};
use std::path::{Path, PathBuf};
use std::ptr::null_mut;
use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Cryptography::{
    BCRYPT_USE_SYSTEM_PREFERRED_RNG, BCryptGenRandom, CRYPT_INTEGER_BLOB,
    CRYPTPROTECT_LOCAL_MACHINE, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
};

/// Bumped when setup creates something new, so an older setup is redone.
pub const VERSION: &str = "1";
pub const GROUP: &str = "CrewsteadSandboxUsers";
/// Local user names may be at most 20 characters.
pub const OFFLINE: &str = "CrewsteadSbxOffline";
pub const ONLINE: &str = "CrewsteadSbxOnline";

pub struct User {
    pub name: String,
    pub sid: String,
    pub password: String,
}

pub struct Users {
    pub group: String,
    pub offline: User,
    pub online: User,
}

pub fn file(home: &Path) -> PathBuf {
    home.join("sandbox-users.txt")
}

/// A random password of 32 letters and digits, plus one of each kind Windows' complexity rule wants.
pub fn password() -> Result<String, String> {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let mut bytes = [0u8; 32];
    let status = unsafe {
        BCryptGenRandom(
            null_mut(),
            bytes.as_mut_ptr(),
            32,
            BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        )
    };
    if status != 0 {
        return Err(format!("BCryptGenRandom failed: {status:#x}"));
    }
    let random: String = bytes
        .iter()
        .map(|byte| ALPHABET[*byte as usize % ALPHABET.len()] as char)
        .collect();
    Ok(format!("{random}-Aa9"))
}

fn blob(bytes: &[u8]) -> CRYPT_INTEGER_BLOB {
    CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    }
}

fn taken(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
    let bytes = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) }.to_vec();
    unsafe { LocalFree(out.pbData.cast()) };
    bytes
}

fn protect(text: &str) -> Result<String, String> {
    let input = blob(text.as_bytes());
    let mut out = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    let flags = CRYPTPROTECT_LOCAL_MACHINE | CRYPTPROTECT_UI_FORBIDDEN;
    let ok = unsafe {
        CryptProtectData(
            &input,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            flags,
            &mut out,
        )
    };
    if ok == 0 {
        return Err(last_error("CryptProtectData"));
    }
    Ok(taken(out)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn unprotect(hex: &str) -> Result<String, String> {
    let bytes: Vec<u8> = (0..hex.len())
        .step_by(2)
        .map(|at| u8::from_str_radix(hex.get(at..at + 2).unwrap_or("zz"), 16))
        .collect::<Result<_, _>>()
        .map_err(|_| "the sandbox users file is damaged".to_string())?;
    let input = blob(&bytes);
    let mut out = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &input,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out,
        )
    };
    if ok == 0 {
        return Err(last_error("CryptUnprotectData"));
    }
    String::from_utf8(taken(out)).map_err(|_| "the sandbox users file is damaged".into())
}

/// Saves the users, readable by the owner only.
pub fn save(home: &Path, users: &Users, owner: &Sid) -> Result<(), String> {
    let line = |key: &str, user: &User| -> Result<String, String> {
        Ok(format!(
            "{key}={}|{}|{}\n",
            user.name,
            user.sid,
            protect(&user.password)?
        ))
    };
    let text = format!(
        "version={VERSION}\ngroup={}\n{}{}",
        users.group,
        line("offline", &users.offline)?,
        line("online", &users.online)?
    );
    let path = file(home);
    std::fs::write(&path, text).map_err(|error| format!("writing {}: {error}", path.display()))?;
    crate::acl::owner_only(&path, owner)
}

/// The users setup made, or why commands cannot run as them (no setup yet, or an older one).
pub fn load(home: &Path) -> Result<Users, String> {
    let path = file(home);
    let text = std::fs::read_to_string(&path)
        .map_err(|_| "the Windows sandbox is not set up on this computer".to_string())?;
    let value = |key: &str| {
        text.lines()
            .find_map(|line| line.strip_prefix(&format!("{key}=")))
            .map(str::to_string)
            .ok_or_else(|| format!("the sandbox users file has no {key}"))
    };
    if value("version")? != VERSION {
        return Err("the Windows sandbox was set up by an older version; set it up again".into());
    }
    let user = |key: &str| -> Result<User, String> {
        let entry = value(key)?;
        let parts: Vec<&str> = entry.split('|').collect();
        let [name, sid, secret] = parts[..] else {
            return Err("the sandbox users file is damaged".into());
        };
        Ok(User {
            name: name.into(),
            sid: sid.into(),
            password: unprotect(secret)?,
        })
    };
    Ok(Users {
        group: value("group")?,
        offline: user("offline")?,
        online: user("online")?,
    })
}
