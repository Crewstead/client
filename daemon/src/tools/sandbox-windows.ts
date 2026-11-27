import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVATE_HOME_ENTRIES } from '@crewstead/core/protocol';
import { gitRuns } from './git-metadata.ts';

/**
 * Commands on Windows run through crewstead-sandbox.exe (the `sandbox-windows` folder), which works
 * as OpenAI Codex's Windows sandbox does. "users": once set up by an administrator, commands run as a
 * hidden local user that cannot read the owner's files and, unless network was asked for, has no
 * network (the firewall). "restricted": without that setup, commands keep the owner's identity with a
 * restricted token, so they can write only in the project but can read the owner's files and reach
 * the network (proxy variables are all that stops ordinary tools, as in Codex).
 */
export type WindowsSandbox = 'users' | 'restricted';

const EXE = 'crewstead-sandbox.exe';

/** The sandbox program: beside the app's bundled service, or built in this checkout. */
export function sandboxProgram(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.CREWSTEAD_SANDBOX_EXE,
    join(here, EXE),
    resolve(here, '../../../sandbox-windows/target/release', EXE),
  ];
  return candidates.find((path): path is string => !!path && existsSync(path));
}

/** Which sandbox commands get here; undefined when none can run (no program, or it fails). */
export function windowsSandbox(home: string): WindowsSandbox | undefined {
  const program = sandboxProgram();
  if (process.platform !== 'win32' || !program) return undefined;
  const check = spawnSync(program, ['check', '--home', home], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  });
  if (check.status !== 0) return undefined;
  return check.stdout.trim() === 'users' ? 'users' : 'restricted';
}

/**
 * A project's own SID, which its folder grants writing to: each folder gets a different one, so a
 * command in one project cannot write to another. Made from a random seed kept in `home`.
 */
export function capabilitySid(home: string, root: string) {
  const seedFile = join(home, 'sandbox-seed');
  if (!existsSync(seedFile))
    writeFileSync(seedFile, randomBytes(32).toString('hex'), { mode: 0o600 });
  const seed = readFileSync(seedFile, 'utf8').trim();
  const hash = createHash('sha256')
    .update(`${seed}\0${resolve(root).toLowerCase()}`)
    .digest();
  const parts = [0, 4, 8, 12].map((at) => hash.readUInt32BE(at));
  return `S-1-5-21-${parts.join('-')}`;
}

/** Folders on the owner's PATH inside their own folder (per-user installs: Node, Git, Python…). */
function ownPrograms() {
  const home = homedir();
  const private_ = PRIVATE_HOME_ENTRIES.map((entry) => join(home, entry).toLowerCase());
  return (process.env.PATH ?? '').split(delimiter).filter((folder) => {
    const inside = relative(home, folder);
    if (!folder || inside.startsWith('..') || inside === '' || !existsSync(folder)) return false;
    const lower = resolve(folder).toLowerCase();
    return !private_.some((entry) => lower === entry || lower.startsWith(entry + sep));
  });
}

/**
 * What Windows and its programs need from the environment, and nothing else: as bubblewrap starts
 * from an empty one, so tokens and keys in the service's own environment never reach a command.
 */
const KEEP = new Set([
  // The sandbox's own step log (crewstead-sandbox.exe), when someone asks for it.
  'CREWSTEAD_SANDBOX_TRACE',
  'ALLUSERSPROFILE',
  'APPDATA',
  'COMMONPROGRAMFILES',
  'COMMONPROGRAMFILES(X86)',
  'COMMONPROGRAMW6432',
  'COMPUTERNAME',
  'COMSPEC',
  'HOMEDRIVE',
  'HOMEPATH',
  'LANG',
  'LOCALAPPDATA',
  'NUMBER_OF_PROCESSORS',
  'OS',
  'PATH',
  'PATHEXT',
  'PROCESSOR_ARCHITECTURE',
  'PROCESSOR_IDENTIFIER',
  'PROCESSOR_LEVEL',
  'PROCESSOR_REVISION',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMW6432',
  'PSMODULEPATH',
  'PUBLIC',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'TZ',
  'USERDOMAIN',
  'USERNAME',
  'USERPROFILE',
  'WINDIR',
]);
const systemEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([name]) => KEEP.has(name.toUpperCase())));

/** One argument as Windows programs split their command line (the C runtime's rules). */
export function quoteArgument(arg: string) {
  if (arg && !/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

/** Proxy settings that make ordinary tools fail fast without network, as Codex sets them. */
const NO_NETWORK = {
  HTTP_PROXY: 'http://127.0.0.1:9',
  HTTPS_PROXY: 'http://127.0.0.1:9',
  ALL_PROXY: 'http://127.0.0.1:9',
  NO_PROXY: 'localhost,127.0.0.1,::1',
  GIT_HTTP_PROXY: 'http://127.0.0.1:9',
  GIT_HTTPS_PROXY: 'http://127.0.0.1:9',
  GIT_SSH_COMMAND: 'cmd /c exit 1',
  PIP_NO_INDEX: '1',
  NPM_CONFIG_OFFLINE: 'true',
  CARGO_NET_OFFLINE: 'true',
};

/**
 * A folder's full name. A short one ("C:\\Users\\RUNNER~1") makes PowerShell list each folder above
 * it to spell it out, which a sandbox user may not do in the owner's own folder.
 */
function longPath(path: string) {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

export interface WindowsPlace {
  root: string;
  network: boolean;
  /** The project allows Git: commits may be made, but hooks and config stay read-only. */
  git?: boolean;
  /** A terminal someone types into: colours, and the shell instead of one command. */
  terminal?: boolean;
  /** Extra environment (the owner's Git name and email for commits). */
  env?: Record<string, string>;
}

/** How a command line (or, in a terminal, a shell) starts in the sandbox. */
export function windowsLaunch(
  home: string,
  kind: WindowsSandbox,
  place: WindowsPlace,
  command?: string,
): { file: string; argv: string[]; env: NodeJS.ProcessEnv } {
  const program = sandboxProgram();
  if (!program) throw new Error(`Commands need ${EXE} on this computer; none were run.`);
  const root = longPath(place.root);
  const sid = capabilitySid(home, root);
  const temp = join(longPath(tmpdir()), 'crewstead-sandbox', sid.replace(/^S-1-5-21-/, ''));
  mkdirSync(temp, { recursive: true });
  const argv = ['run', '--sid', sid, '--write', root, '--write', temp, '--cwd', root];
  if (kind === 'users') {
    argv.push('--users', '--home', home, ...(place.network ? ['--network'] : []));
    for (const folder of ownPrograms()) argv.push('--read', folder);
  }
  const git = join(root, '.git');
  if (!place.git) argv.push('--deny', git);
  else argv.push('--clear', git, ...gitRuns(root).flatMap((path) => ['--deny', path]));
  argv.push('--', 'powershell.exe', '-NoProfile');
  if (command === undefined) argv.push('-NoLogo');
  else argv.push('-NonInteractive', '-Command', command);
  const env: NodeJS.ProcessEnv = {
    ...systemEnv(),
    ...(place.terminal
      ? { TERM: 'xterm-256color', COLORTERM: 'truecolor' }
      : { TERM: 'dumb', CI: '1', NO_COLOR: '1' }),
    TEMP: temp,
    TMP: temp,
    npm_config_cache: join(temp, 'npm'),
    GIT_TERMINAL_PROMPT: '0',
    ...(place.network || kind === 'users' ? {} : NO_NETWORK),
    ...place.env,
  };
  return { file: program, argv, env };
}

/**
 * Sets up the sandbox users, as an administrator: Windows asks the owner to allow it (UAC). Resolves
 * once that is done; rejects when they declined or setup failed.
 */
export function setUpWindowsSandbox(home: string, ownerSid: string, remove = false) {
  const program = sandboxProgram();
  if (!program) return Promise.reject(new Error(`${EXE} is missing.`));
  const args = remove ? ['remove', '--home', home] : ['setup', '--home', home, '--owner', ownerSid];
  // Start-Process joins a list with bare spaces, so a folder with a space would split: one string,
  // quoted as the program will split it, inside a PowerShell literal.
  const line = args.map(quoteArgument).join(' ').replace(/'/g, "''");
  const script =
    `$p = Start-Process -FilePath '${program.replace(/'/g, "''")}' -ArgumentList '${line}' ` +
    '-Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode';
  return new Promise<void>((done, fail) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done() : fail(new Error('The sandbox was not set up (declined, or it failed).')),
    );
  });
}

/** The signed-in owner's SID, for the setup to keep the passwords file theirs. */
export function ownerSid() {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 15_000 },
  );
  const sid = result.stdout?.trim() ?? '';
  if (!/^S-1-5-21-[\d-]+$/.test(sid)) throw new Error('Could not tell who is signed in.');
  return sid;
}
