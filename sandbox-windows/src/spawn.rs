//! Starts the command with the restricted token, inside a job that ends it and everything it starts
//! when this program ends. Adapted from OpenAI Codex (codex-rs/windows-sandbox-rs/src/process.rs and
//! proc_thread_attr.rs, Apache-2.0).

use crate::token::Token;
use crate::win::{last_error, wide, wide_path};
use std::ffi::c_void;
use std::path::Path;
use std::ptr::null_mut;
use windows_sys::Win32::Foundation::{
    CloseHandle, HANDLE, HANDLE_FLAG_INHERIT, INVALID_HANDLE_VALUE, SetHandleInformation,
};
use windows_sys::Win32::System::Console::{
    GetConsoleMode, GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JobObjectExtendedLimitInformation, SetInformationJobObject,
};
use windows_sys::Win32::System::Threading::{
    CREATE_NO_WINDOW, CREATE_UNICODE_ENVIRONMENT, CreateProcessAsUserW,
    DeleteProcThreadAttributeList, EXTENDED_STARTUPINFO_PRESENT, GetExitCodeProcess, INFINITE,
    InitializeProcThreadAttributeList, LPPROC_THREAD_ATTRIBUTE_LIST, PROCESS_INFORMATION,
    STARTF_USESTDHANDLES, STARTUPINFOEXW, UpdateProcThreadAttribute, WaitForSingleObject,
};

const PROC_THREAD_ATTRIBUTE_HANDLE_LIST: usize = 0x0002_0002;
const PROC_THREAD_ATTRIBUTE_JOB_LIST: usize = 0x0002_000D;

/// A job that ends all its processes once its last handle closes: when this program exits or is
/// killed. Processes in it cannot leave it (no breakaway).
pub struct Job(HANDLE);

impl Job {
    pub fn new() -> Result<Job, String> {
        Ok(Job(job()?))
    }

    /// Puts a (suspended) process in the job.
    pub fn add(&self, process: HANDLE) -> Result<(), String> {
        if unsafe { AssignProcessToJobObject(self.0, process) } == 0 {
            return Err(last_error("AssignProcessToJobObject"));
        }
        Ok(())
    }
}

impl Drop for Job {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

fn job() -> Result<HANDLE, String> {
    let job = unsafe { CreateJobObjectW(null_mut(), null_mut()) };
    if job.is_null() {
        return Err(last_error("CreateJobObjectW"));
    }
    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    limits.BasicLimitInformation.LimitFlags =
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION;
    let ok = unsafe {
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &limits as *const _ as *const c_void,
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if ok == 0 {
        return Err(last_error("SetInformationJobObject"));
    }
    Ok(job)
}

/// The startup attributes: the job (joined before the command's first instruction runs) and, with
/// pipes, exactly which handles it inherits.
struct Attributes {
    buffer: Vec<u64>,
    // Windows keeps pointers to these until the process is created.
    jobs: Vec<HANDLE>,
    handles: Vec<HANDLE>,
}

impl Attributes {
    fn new(job: HANDLE, handles: Vec<HANDLE>) -> Result<Attributes, String> {
        let count = if handles.is_empty() { 1 } else { 2 };
        let mut size = 0usize;
        unsafe { InitializeProcThreadAttributeList(null_mut(), count, 0, &mut size) };
        let mut list = Attributes {
            buffer: vec![0; size.div_ceil(8)],
            jobs: vec![job],
            handles,
        };
        if unsafe { InitializeProcThreadAttributeList(list.ptr(), count, 0, &mut size) } == 0 {
            return Err(last_error("InitializeProcThreadAttributeList"));
        }
        list.set(
            PROC_THREAD_ATTRIBUTE_JOB_LIST,
            list.jobs.as_ptr(),
            list.jobs.len(),
        )?;
        if !list.handles.is_empty() {
            list.set(
                PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                list.handles.as_ptr(),
                list.handles.len(),
            )?;
        }
        Ok(list)
    }

    fn ptr(&mut self) -> LPPROC_THREAD_ATTRIBUTE_LIST {
        self.buffer.as_mut_ptr().cast()
    }

    fn set(&mut self, attribute: usize, value: *const HANDLE, count: usize) -> Result<(), String> {
        let size = count * size_of::<HANDLE>();
        let ok = unsafe {
            UpdateProcThreadAttribute(
                self.ptr(),
                0,
                attribute,
                value as *const c_void,
                size,
                null_mut(),
                null_mut(),
            )
        };
        if ok == 0 {
            return Err(last_error("UpdateProcThreadAttribute"));
        }
        Ok(())
    }
}

impl Drop for Attributes {
    fn drop(&mut self) {
        unsafe { DeleteProcThreadAttributeList(self.ptr()) };
    }
}

/// True when this program runs in a console (a terminal), not with pipes.
pub fn in_console() -> bool {
    let mut mode = 0u32;
    unsafe { GetConsoleMode(GetStdHandle(STD_INPUT_HANDLE), &mut mode) != 0 }
}

/// This program's standard handles, made inheritable; invalid ones are left out.
fn standard_handles() -> Result<[HANDLE; 3], String> {
    let handles = [STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE]
        .map(|which| unsafe { GetStdHandle(which) });
    for &handle in &handles {
        if handle.is_null() || handle == INVALID_HANDLE_VALUE {
            continue;
        }
        if unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) } == 0 {
            return Err(last_error("SetHandleInformation"));
        }
    }
    Ok(handles)
}

/// Runs `command_line` in `cwd` with `token` on `desktop` ("Winsta0\\name", NUL-terminated) and
/// returns its exit code once it ends. In a console it shares this program's console; otherwise it
/// gets this program's pipes.
pub fn run(token: &Token, command_line: &str, cwd: &Path, desktop: &[u16]) -> Result<u32, String> {
    let job = Job::new()?;
    let console = in_console();
    let handles = if console {
        [null_mut(); 3]
    } else {
        standard_handles()?
    };
    let mut inherited: Vec<HANDLE> = Vec::new();
    for handle in handles {
        if !handle.is_null() && handle != INVALID_HANDLE_VALUE && !inherited.contains(&handle) {
            inherited.push(handle);
        }
    }
    let mut attributes = Attributes::new(job.0, inherited)?;
    let mut startup: STARTUPINFOEXW = unsafe { std::mem::zeroed() };
    startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    // Without a desktop set, some programs (PowerShell) fail to start with a restricted token.
    startup.StartupInfo.lpDesktop = desktop.as_ptr() as *mut u16;
    if !console {
        startup.StartupInfo.dwFlags |= STARTF_USESTDHANDLES;
        [
            startup.StartupInfo.hStdInput,
            startup.StartupInfo.hStdOutput,
            startup.StartupInfo.hStdError,
        ] = handles;
    }
    startup.lpAttributeList = attributes.ptr();
    let flags = CREATE_UNICODE_ENVIRONMENT
        | EXTENDED_STARTUPINFO_PRESENT
        | if console { 0 } else { CREATE_NO_WINDOW };
    let mut line = wide(command_line);
    let cwd = wide_path(cwd);
    let mut process: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        CreateProcessAsUserW(
            token.0,
            null_mut(),
            line.as_mut_ptr(),
            null_mut(),
            null_mut(),
            1,
            flags,
            null_mut(), // this program's environment, which the computer service set up
            cwd.as_ptr(),
            &startup.StartupInfo,
            &mut process,
        )
    };
    if ok == 0 {
        return Err(last_error("CreateProcessAsUserW"));
    }
    drop(attributes);
    crate::win::trace("command started");
    unsafe {
        CloseHandle(process.hThread);
        WaitForSingleObject(process.hProcess, INFINITE);
    }
    let mut code = 1u32;
    unsafe {
        GetExitCodeProcess(process.hProcess, &mut code);
        crate::win::trace(&format!("command ended: {code:#x}"));
        CloseHandle(process.hProcess);
    }
    // Ends whatever the command left running.
    drop(job);
    Ok(code)
}
