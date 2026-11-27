//! Runs a command as a sandbox user, as OpenAI Codex's elevated sandbox does (elevated/runner_client.rs,
//! Apache-2.0): this program, as the owner, gives the sandbox users' group the project folder and
//! starts a copy of itself as the offline (or online) user with CreateProcessWithLogonW. The copy
//! (`inner` in main.rs) restricts its own token again and starts the command on a private desktop.
//! The copy starts suspended and joins a job before it runs, so it and everything it starts end with
//! this program.

use crate::creds::Users;
use crate::desktop::Desktop;
use crate::spawn::{self, Job};
use crate::win::{Sid, last_error, trace as win_trace, wide, wide_path};
use std::fs::File;
use std::io::{Read, Write};
use std::os::windows::io::FromRawHandle;
use std::path::Path;
use std::ptr::null_mut;
use windows_sys::Win32::Foundation::{
    CloseHandle, HANDLE, HANDLE_FLAG_INHERIT, INVALID_HANDLE_VALUE, SetHandleInformation,
};
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::System::Console::{
    GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
};
use windows_sys::Win32::System::Environment::{FreeEnvironmentStringsW, GetEnvironmentStringsW};
use windows_sys::Win32::System::Pipes::CreatePipe;
use windows_sys::Win32::System::Threading::{
    CREATE_NO_WINDOW, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, CreateProcessWithLogonW,
    GetExitCodeProcess, INFINITE, LOGON_WITH_PROFILE, PROCESS_INFORMATION, ResumeThread,
    STARTF_USESTDHANDLES, STARTUPINFOW, TerminateProcess, WaitForSingleObject,
};

/// What `run` needs besides the command: the folders' rules and who runs it.
pub struct Place<'a> {
    pub capability: &'a Sid,
    pub write: &'a [std::path::PathBuf],
    pub read: &'a [std::path::PathBuf],
    pub deny: &'a [std::path::PathBuf],
    pub clear: &'a [std::path::PathBuf],
    pub network: bool,
}

/// Sets the folders' permissions for the sandbox users' group and the project's capability SID.
fn prepare(place: &Place, group: &Sid) -> Result<(), String> {
    for path in place.clear.iter().filter(|path| path.exists()) {
        crate::acl::clear(path, place.capability)?;
        crate::acl::clear(path, group)?;
    }
    for path in place.write {
        crate::acl::allow_write(path, place.capability)?;
        crate::acl::allow_write(path, group)?;
    }
    for path in place.read.iter().filter(|path| path.exists()) {
        crate::acl::allow_read(path, group)?;
    }
    // PowerShell spells out its folder by listing each one above it; inside the owner's profile the
    // users may list those (names only, those folders only). Above the profile, Users can already.
    if let Some(profile) = std::env::var_os("USERPROFILE").map(std::path::PathBuf::from) {
        for path in place.write.iter().chain(place.read) {
            for folder in path
                .ancestors()
                .skip(1)
                .filter(|folder| folder.starts_with(&profile))
            {
                crate::acl::allow_list(folder, group)?;
            }
        }
    }
    // The group too: its own grant on the project would otherwise cover them for any process of the
    // sandbox user that is not restricted (the `inner` copy, which also locks itself; main.rs).
    for path in place.deny.iter().filter(|path| path.exists()) {
        crate::acl::deny_write(path, place.capability)?;
        crate::acl::deny_write(path, group)?;
    }
    crate::acl::allow_null_device(place.capability);
    Ok(())
}

/// A pipe whose `child` end the new process inherits.
fn pipe() -> Result<(HANDLE, HANDLE), String> {
    let attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: null_mut(),
        bInheritHandle: 1,
    };
    let (mut read, mut write) = (null_mut(), null_mut());
    if unsafe { CreatePipe(&mut read, &mut write, &attributes, 0) } == 0 {
        return Err(last_error("CreatePipe"));
    }
    Ok((read, write))
}

fn copy(mut from: File, mut to: File) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        while let Ok(count) = from.read(&mut buffer) {
            if count == 0 || to.write_all(&buffer[..count]).is_err() {
                break;
            }
            let _ = to.flush();
        }
    })
}

/// In a terminal: the pipe ends the child got (closed here once it has them) and the copy of its
/// output, which must finish before this program exits.
struct Relay {
    child_ends: [HANDLE; 2],
    output: std::thread::JoinHandle<()>,
}

/// The child's standard handles. With pipes they are this program's own; in a terminal another
/// user cannot share this console, so output and typing are copied through pipes (no colours then).
fn standard_handles() -> Result<([HANDLE; 3], Option<Relay>), String> {
    let own = [STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE]
        .map(|which| unsafe { GetStdHandle(which) });
    if !spawn::in_console() {
        for &handle in own
            .iter()
            .filter(|h| !h.is_null() && **h != INVALID_HANDLE_VALUE)
        {
            if unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) }
                == 0
            {
                return Err(last_error("SetHandleInformation"));
            }
        }
        return Ok((own, None));
    }
    let (input_read, input_write) = pipe()?;
    let (output_read, output_write) = pipe()?;
    for parent_end in [input_write, output_read] {
        unsafe { SetHandleInformation(parent_end, HANDLE_FLAG_INHERIT, 0) };
    }
    let output = unsafe {
        copy(
            File::from_raw_handle(own[0]),
            File::from_raw_handle(input_write),
        );
        copy(
            File::from_raw_handle(output_read),
            File::from_raw_handle(own[1]),
        )
    };
    let relay = Relay {
        child_ends: [input_read, output_write],
        output,
    };
    Ok(([input_read, output_write, output_write], Some(relay)))
}

/// Runs this program's `inner` command with `inner_args` as the sandbox user, on a private desktop
/// only the owner and that user may use, and returns the command's exit code.
pub fn run(users: &Users, place: &Place, inner_args: &[String], cwd: &Path) -> Result<u32, String> {
    let group = Sid::parse(&users.group)?;
    win_trace("preparing folders");
    prepare(place, &group)?;
    win_trace("folders ready");
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    // This program runs as the user too, and it usually sits in the owner's own folder (the app).
    // Installed for all users it is readable already, and the owner may not change that folder.
    if let Some(folder) = exe.parent() {
        let _ = crate::acl::allow_read(folder, &group);
    }
    let user = if place.network {
        &users.online
    } else {
        &users.offline
    };
    let owner = crate::token::user_sid(&crate::token::own_token()?)?;
    let sandbox_user = Sid::parse(&user.sid)?;
    let desktop = Desktop::create_apart(&owner, &sandbox_user)?;
    win_trace(&format!("desktop {} made", desktop.path));
    let mut argv = vec![exe.to_string_lossy().into_owned(), "inner".into()];
    argv.extend(["--desktop".into(), desktop.path.clone()]);
    argv.extend_from_slice(inner_args);
    let mut line = wide(crate::win::command_line(&argv));
    let (handles, relay) = standard_handles()?;
    let mut startup: STARTUPINFOW = unsafe { std::mem::zeroed() };
    startup.cb = size_of::<STARTUPINFOW>() as u32;
    startup.dwFlags = STARTF_USESTDHANDLES;
    [startup.hStdInput, startup.hStdOutput, startup.hStdError] = handles;
    let environment = unsafe { GetEnvironmentStringsW() };
    let mut process: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        CreateProcessWithLogonW(
            wide(&user.name).as_ptr(),
            wide(".").as_ptr(),
            wide(&user.password).as_ptr(),
            // Its own profile and registry: without them .NET cannot read even its proxy settings.
            LOGON_WITH_PROFILE,
            wide_path(&exe).as_ptr(),
            line.as_mut_ptr(),
            CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
            environment.cast(),
            wide_path(cwd).as_ptr(),
            &startup,
            &mut process,
        )
    };
    let failed = (ok == 0).then(|| last_error("CreateProcessWithLogonW"));
    unsafe { FreeEnvironmentStringsW(environment) };
    if let Some(relay) = &relay {
        // The child has its own copies now; ours would keep its output from ever ending.
        for &end in &relay.child_ends {
            unsafe { CloseHandle(end) };
        }
    }
    if let Some(error) = failed {
        return Err(error);
    }
    win_trace("sandbox user started (suspended)");
    let job = Job::new()?;
    if let Err(error) = job.add(process.hProcess) {
        unsafe { TerminateProcess(process.hProcess, 125) };
        return Err(error);
    }
    let mut code = 1u32;
    unsafe {
        ResumeThread(process.hThread);
        CloseHandle(process.hThread);
        WaitForSingleObject(process.hProcess, INFINITE);
        GetExitCodeProcess(process.hProcess, &mut code);
        CloseHandle(process.hProcess);
    }
    drop(job);
    if let Some(relay) = relay {
        let _ = relay.output.join();
    }
    Ok(code)
}
