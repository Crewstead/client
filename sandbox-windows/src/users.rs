//! One-time setup, as an administrator, of what commands run as: two local users in their own group,
//! hidden from the sign-in screen, and firewall rules that keep one of them off the network. As OpenAI
//! Codex's elevated sandbox does (setup_provisioning/sandbox_users.rs and firewall.rs, Apache-2.0).

use crate::creds::{self, GROUP, OFFLINE, ONLINE, User, Users};
use crate::win::{Sid, last_error, wide};
use std::ffi::c_void;
use std::path::Path;
use std::process::Command;
use std::ptr::null_mut;
use windows_sys::Win32::NetworkManagement::NetManagement::{
    LOCALGROUP_INFO_1, LOCALGROUP_MEMBERS_INFO_3, NERR_Success, NetLocalGroupAdd,
    NetLocalGroupAddMembers, NetLocalGroupDel, NetUserAdd, NetUserDel, NetUserSetInfo,
    UF_DONT_EXPIRE_PASSWD, UF_PASSWD_CANT_CHANGE, UF_SCRIPT, USER_INFO_1, USER_INFO_1003,
    USER_PRIV_USER,
};
use windows_sys::Win32::Security::{LookupAccountNameW, LookupAccountSidW, SID_NAME_USE};

const USERS_GROUP: &str = "S-1-5-32-545";
const FIREWALL_GROUP: &str = "Crewstead sandbox";
/// Codex's address lists (setup_provisioning/firewall.rs).
const NOT_LOOPBACK: &str = "0.0.0.0-126.255.255.255,128.0.0.0-255.255.255.255,::,::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff";
const LOOPBACK: &str = "127.0.0.0/8,::/127";
const HIDDEN_USERS: &str =
    r"HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\SpecialAccounts\UserList";

/// The SID of an account, by name.
pub fn sid_of(name: &str) -> Result<String, String> {
    let mut sid = vec![0u8; 68];
    let mut sid_size = sid.len() as u32;
    let mut domain = vec![0u16; 256];
    let mut domain_size = domain.len() as u32;
    let mut kind: SID_NAME_USE = 0;
    let ok = unsafe {
        LookupAccountNameW(
            null_mut(),
            wide(name).as_ptr(),
            sid.as_mut_ptr().cast(),
            &mut sid_size,
            domain.as_mut_ptr(),
            &mut domain_size,
            &mut kind,
        )
    };
    if ok == 0 {
        return Err(last_error(&format!("LookupAccountNameW({name})")));
    }
    crate::win::sid_text(sid.as_mut_ptr() as *mut c_void)
}

/// The local name of a well-known group (it is translated: "Users", "Benutzer"…).
fn name_of(sid: &str) -> Result<String, String> {
    let sid = Sid::parse(sid)?;
    let mut name = vec![0u16; 256];
    let mut name_size = name.len() as u32;
    let mut domain = vec![0u16; 256];
    let mut domain_size = domain.len() as u32;
    let mut kind: SID_NAME_USE = 0;
    let ok = unsafe {
        LookupAccountSidW(
            null_mut(),
            sid.ptr(),
            name.as_mut_ptr(),
            &mut name_size,
            domain.as_mut_ptr(),
            &mut domain_size,
            &mut kind,
        )
    };
    if ok == 0 {
        return Err(last_error("LookupAccountSidW"));
    }
    Ok(String::from_utf16_lossy(&name[..name_size as usize]))
}

fn add_member(group: &str, member: &str) {
    let member = wide(member);
    let entry = LOCALGROUP_MEMBERS_INFO_3 {
        lgrmi3_domainandname: member.as_ptr() as *mut u16,
    };
    // Already a member is an error too; either way the member is in the group afterwards.
    unsafe {
        NetLocalGroupAddMembers(
            null_mut(),
            wide(group).as_ptr(),
            3,
            &entry as *const _ as *const u8,
            1,
        )
    };
}

/// Creates the user, or gives an existing one the new password.
fn ensure_user(name: &str, password: &str) -> Result<User, String> {
    let (name_w, password_w) = (wide(name), wide(password));
    let comment = wide("Runs Crewstead's sandboxed commands");
    let info = USER_INFO_1 {
        usri1_name: name_w.as_ptr() as *mut u16,
        usri1_password: password_w.as_ptr() as *mut u16,
        usri1_password_age: 0,
        usri1_priv: USER_PRIV_USER,
        usri1_home_dir: null_mut(),
        usri1_comment: comment.as_ptr() as *mut u16,
        usri1_flags: UF_SCRIPT | UF_DONT_EXPIRE_PASSWD | UF_PASSWD_CANT_CHANGE,
        usri1_script_path: null_mut(),
    };
    let added = unsafe { NetUserAdd(null_mut(), 1, &info as *const _ as *const u8, null_mut()) };
    if added != NERR_Success {
        let reset = USER_INFO_1003 {
            usri1003_password: password_w.as_ptr() as *mut u16,
        };
        let set = unsafe {
            NetUserSetInfo(
                null_mut(),
                name_w.as_ptr(),
                1003,
                &reset as *const _ as *const u8,
                null_mut(),
            )
        };
        if set != NERR_Success {
            return Err(format!(
                "could not create the user {name} (error {added}, then {set})"
            ));
        }
    }
    add_member(&name_of(USERS_GROUP)?, name);
    add_member(GROUP, name);
    Ok(User {
        name: name.into(),
        sid: sid_of(name)?,
        password: password.into(),
    })
}

fn powershell(script: &str) -> Result<(), String> {
    // Without progress bars, which PowerShell writes to a redirected error stream as XML.
    let script = format!("$ProgressPreference = 'SilentlyContinue'\n{script}");
    let status = Command::new("powershell.exe")
        .stdin(std::process::Stdio::null())
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .status()
        .map_err(|error| format!("could not start PowerShell: {error}"))?;
    if !status.success() {
        return Err(format!("PowerShell failed ({status})"));
    }
    Ok(())
}

/// Firewall rules for the offline user: nothing in or out, the computer's own addresses included.
fn firewall(offline_sid: &str) -> Result<(), String> {
    // Through the firewall's COM interface, as Codex makes them: New-NetFirewallRule refuses the
    // addresses "::" and "::1" these rules need.
    let script = format!(
        "$ErrorActionPreference = 'Stop'\n\
         Get-NetFirewallRule -Group '{FIREWALL_GROUP}' -ErrorAction SilentlyContinue | Remove-NetFirewallRule\n\
         $fw = New-Object -ComObject HNetCfg.FwPolicy2\n\
         function Block($name, $direction, $protocol, $addresses) {{\n\
           $rule = New-Object -ComObject HNetCfg.FWRule\n\
           $rule.Name = 'Crewstead sandbox: ' + $name\n\
           $rule.Grouping = '{FIREWALL_GROUP}'\n\
           $rule.Direction = $direction\n\
           $rule.Action = 0\n\
           $rule.Protocol = $protocol\n\
           $rule.RemoteAddresses = $addresses\n\
           $rule.Profiles = 0x7FFFFFFF\n\
           $rule.LocalUserAuthorizedList = 'O:LSD:(A;;CC;;;{offline_sid})'\n\
           $rule.Enabled = $true\n\
           $fw.Rules.Add($rule)\n\
         }}\n\
         Block 'no network out' 2 256 '{NOT_LOOPBACK}'\n\
         Block 'no network in' 1 256 '{NOT_LOOPBACK}'\n\
         Block 'no local TCP' 2 6 '{LOOPBACK}'\n\
         Block 'no local UDP' 2 17 '{LOOPBACK}'\n"
    );
    // Rules do nothing where the firewall is off or a group policy ignores local rules (Codex checks
    // the same): then setup fails, instead of a sandbox that only looks offline.
    let check = "if (Get-NetFirewallProfile -PolicyStore ActiveStore | Where-Object { $_.Enabled -ne 'True' }) {\n\
           throw 'The Windows firewall is off for some networks, so the sandbox could not keep commands off the network. Turn it on, then set the sandbox up again.' }\n\
         if ((New-Object -ComObject HNetCfg.FwPolicy2).LocalPolicyModifyState -eq 1) {\n\
           throw 'A group policy ignores this computer''s own firewall rules, so the sandbox could not keep commands off the network.' }\n";
    powershell(&(script + check))
}

/// Keeps the users off the sign-in screen.
fn hide(names: &[&str]) -> Result<(), String> {
    let mut script = format!(
        "$ErrorActionPreference = 'Stop'\nif (-not (Test-Path '{HIDDEN_USERS}')) {{ New-Item -Force -Path '{HIDDEN_USERS}' | Out-Null }}\n"
    );
    for name in names {
        script += &format!(
            "New-ItemProperty -Force -Path '{HIDDEN_USERS}' -Name '{name}' -Value 0 -PropertyType DWord | Out-Null\n"
        );
    }
    powershell(&script)
}

/// Sets everything up (again), with new passwords; needs an administrator.
pub fn setup(home: &Path, owner: &str) -> Result<(), String> {
    let owner = Sid::parse(owner)?;
    let comment = wide("Users that run Crewstead's sandboxed commands");
    let group_w = wide(GROUP);
    let info = LOCALGROUP_INFO_1 {
        lgrpi1_name: group_w.as_ptr() as *mut u16,
        lgrpi1_comment: comment.as_ptr() as *mut u16,
    };
    // Fails harmlessly when the group is there already.
    unsafe { NetLocalGroupAdd(null_mut(), 1, &info as *const _ as *const u8, null_mut()) };
    let offline = ensure_user(OFFLINE, &creds::password()?)?;
    let online = ensure_user(ONLINE, &creds::password()?)?;
    hide(&[OFFLINE, ONLINE])?;
    firewall(&offline.sid)?;
    let users = Users {
        group: sid_of(GROUP)?,
        offline,
        online,
    };
    creds::save(home, &users, &owner)
}

/// Removes the users, their group, the firewall rules and the saved passwords; needs an administrator.
/// Permissions given to project folders stay, as Codex leaves them: they name SIDs that no longer exist.
pub fn remove(home: &Path) -> Result<(), String> {
    for name in [OFFLINE, ONLINE] {
        unsafe { NetUserDel(null_mut(), wide(name).as_ptr()) };
    }
    unsafe { NetLocalGroupDel(null_mut(), wide(GROUP).as_ptr()) };
    let script = format!(
        "Get-NetFirewallRule -Group '{FIREWALL_GROUP}' -ErrorAction SilentlyContinue | Remove-NetFirewallRule\n\
         Remove-ItemProperty -Path '{HIDDEN_USERS}' -Name '{OFFLINE}','{ONLINE}' -ErrorAction SilentlyContinue"
    );
    powershell(&script)?;
    let _ = std::fs::remove_file(creds::file(home));
    Ok(())
}
