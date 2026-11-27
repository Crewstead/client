//! crewstead-sandbox: runs one command for Crewstead's computer service in a Windows sandbox, the way
//! OpenAI Codex sandboxes commands on Windows (see NOTICE).
//!
//!   check [--home <dir>]      prints "users" when commands can run as the sandbox users, else
//!                             "restricted"; fails when no sandbox can be made here at all
//!   setup --home <dir> --owner <SID>   as an administrator: creates the sandbox users (users.rs)
//!   remove --home <dir>                as an administrator: removes them again
//!   run [--users --home <dir> [--network]] --sid <SID> --write <dir>… [--read <dir>…]
//!       [--deny <path>…] [--clear <path>…] --cwd <dir> -- <program> [arguments…]
//!
//! `run` without `--users` is Codex's non-administrator sandbox: the owner's own identity with a
//! restricted token, so writes are limited to the `--write` folders but reads and the network are not
//! (the computer service sets proxy variables for that, as Codex does). With `--users` the command
//! runs as a sandbox user (logon.rs), which reads only what that user may and, unless `--network`,
//! has no network. `--sid` is the project's capability SID; `--deny` paths may not be written; `--clear`
//! paths lose their old entries (a rule changed); `--read` folders become readable to the users.

#[cfg(windows)]
mod acl;
#[cfg(windows)]
mod creds;
#[cfg(windows)]
mod desktop;
#[cfg(windows)]
mod logon;
#[cfg(windows)]
mod spawn;
#[cfg(windows)]
mod token;
#[cfg(windows)]
mod users;
#[cfg(windows)]
mod win;

#[cfg(not(windows))]
fn main() {
    eprintln!("crewstead-sandbox runs on Windows only.");
    std::process::exit(125);
}

#[cfg(windows)]
use std::path::PathBuf;

#[cfg(windows)]
#[derive(Default)]
struct Request {
    sid: String,
    home: Option<PathBuf>,
    owner: String,
    desktop: String,
    users: bool,
    network: bool,
    write: Vec<PathBuf>,
    read: Vec<PathBuf>,
    deny: Vec<PathBuf>,
    clear: Vec<PathBuf>,
    cwd: Option<PathBuf>,
    argv: Vec<String>,
}

#[cfg(windows)]
fn parse(args: &[String]) -> Result<Request, String> {
    let mut request = Request::default();
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        match arg.as_str() {
            "--" => {
                request.argv = rest.cloned().collect();
                break;
            }
            "--users" => request.users = true,
            "--network" => request.network = true,
            _ => {
                let value = rest
                    .next()
                    .ok_or_else(|| format!("{arg} needs a value"))?
                    .clone();
                match arg.as_str() {
                    "--sid" => request.sid = value,
                    "--home" => request.home = Some(value.into()),
                    "--owner" => request.owner = value,
                    "--desktop" => request.desktop = value,
                    "--write" => request.write.push(value.into()),
                    "--read" => request.read.push(value.into()),
                    "--deny" => request.deny.push(value.into()),
                    "--clear" => request.clear.push(value.into()),
                    "--cwd" => request.cwd = Some(value.into()),
                    _ => return Err(format!("unknown option {arg}")),
                }
            }
        }
    }
    Ok(request)
}

#[cfg(windows)]
fn home(request: &Request) -> Result<&std::path::Path, String> {
    request
        .home
        .as_deref()
        .ok_or_else(|| "--home is needed".to_string())
}

/// Runs the command with the owner's restricted token, or hands it to a sandbox user.
#[cfg(windows)]
fn run(request: &Request) -> Result<u32, String> {
    if request.argv.is_empty() || request.write.is_empty() {
        return Err("run needs --write and a command after --".into());
    }
    let sid = win::Sid::parse(&request.sid)?;
    let cwd = request
        .cwd
        .clone()
        .unwrap_or_else(|| request.write[0].clone());
    if request.users {
        let users = creds::load(home(request)?)?;
        let place = logon::Place {
            capability: &sid,
            write: &request.write,
            read: &request.read,
            deny: &request.deny,
            clear: &request.clear,
            network: request.network,
        };
        let mut inner = vec!["--sid".into(), request.sid.clone(), "--cwd".into()];
        if request.network {
            inner.insert(0, "--network".into());
        }
        inner.push(cwd.to_string_lossy().into_owned());
        inner.push("--".into());
        inner.extend(request.argv.iter().cloned());
        return logon::run(&users, &place, &inner, &cwd);
    }
    for path in request.clear.iter().filter(|path| path.exists()) {
        acl::clear(path, &sid)?;
    }
    for path in &request.write {
        acl::allow_write(path, &sid)?;
    }
    for path in request.deny.iter().filter(|path| path.exists()) {
        acl::deny_write(path, &sid)?;
    }
    acl::allow_null_device(&sid);
    let base = token::own_token()?;
    let restricted = token::restricted(&base, &[&sid])?;
    let desktop = desktop::Desktop::create(&token::user_sid(&base)?, &[&token::logon_sid(&base)?])?;
    spawn::run(
        &restricted,
        &win::command_line(&request.argv),
        &cwd,
        &desktop.startup_name,
    )
}

/// As the sandbox user: restricts this token again (the project's SID and the user's own) and runs
/// the command on the private desktop the owner's side made.
#[cfg(windows)]
fn inner(request: &Request) -> Result<u32, String> {
    // The command runs as this same user: nothing it starts may open this process and act with its
    // unrestricted token.
    token::protect_self()?;
    let sid = win::Sid::parse(&request.sid)?;
    let base = token::own_token()?;
    let restricted = token::for_sandbox_user(&base, &sid, request.network)?;
    let desktop = win::wide(&request.desktop);
    let cwd = request.cwd.clone().ok_or("inner needs --cwd")?;
    spawn::run(
        &restricted,
        &win::command_line(&request.argv),
        &cwd,
        &desktop,
    )
}

/// Whether a sandbox can be made here, and which.
#[cfg(windows)]
fn check(request: &Request) -> Result<u32, String> {
    let base = token::own_token()?;
    token::restricted(&base, &[&win::Sid::parse("S-1-5-21-1-2-3-4")?])?;
    desktop::Desktop::create(&token::user_sid(&base)?, &[&token::logon_sid(&base)?])?;
    let users = request
        .home
        .as_deref()
        .is_some_and(|home| creds::load(home).is_ok());
    println!("{}", if users { "users" } else { "restricted" });
    Ok(0)
}

/// Ctrl+C in a terminal is for the command, not for this program: it ends when the command does.
#[cfg(windows)]
unsafe extern "system" fn keep_running(_: u32) -> i32 {
    1
}

#[cfg(windows)]
fn main() {
    // No error windows: one on the private desktop would wait for a click nobody can give, and the
    // command would never end (Codex sets the same). Programs started from here inherit it.
    const SEM_FAILCRITICALERRORS: u32 = 0x1;
    const SEM_NOGPFAULTERRORBOX: u32 = 0x2;
    unsafe {
        windows_sys::Win32::System::Diagnostics::Debug::SetErrorMode(
            SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX,
        )
    };
    let args: Vec<String> = std::env::args().skip(1).collect();
    win::trace(&format!(
        "started: {}",
        args.first().map_or("", String::as_str)
    ));
    let request = parse(args.get(1..).unwrap_or_default());
    let result = request.and_then(|request| match args.first().map(String::as_str) {
        Some("check") => check(&request),
        Some("setup") => users::setup(home(&request)?, &request.owner).map(|()| 0),
        Some("remove") => users::remove(home(&request)?).map(|()| 0),
        Some(which @ ("run" | "inner")) => {
            unsafe {
                windows_sys::Win32::System::Console::SetConsoleCtrlHandler(Some(keep_running), 1)
            };
            if which == "run" {
                run(&request)
            } else {
                inner(&request)
            }
        }
        _ => Err("usage: crewstead-sandbox check | setup | remove | run … -- program …".into()),
    });
    match result {
        Ok(code) => std::process::exit(code as i32),
        Err(error) => {
            eprintln!("crewstead-sandbox: {error}");
            std::process::exit(125);
        }
    }
}
