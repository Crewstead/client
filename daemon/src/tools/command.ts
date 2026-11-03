import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from './process.ts';
import { PRIVATE_HOME_ENTRIES, type ProjectToolArguments } from '@crewstead/core/protocol';

/** True when bubblewrap can start a sandbox here; commands never run without one. */
export function sandboxAvailable(bwrap = 'bwrap') {
  const check = spawnSync(bwrap, ['--ro-bind', '/', '/', '--unshare-net', '--', 'true'], {
    stdio: 'ignore',
    timeout: 5_000,
  });
  return check.status === 0;
}

export interface SandboxOptions {
  bwrap?: string;
  /** Extra folders to hide, e.g. this daemon's own settings and the hub's data. */
  hidden?: string[];
  /** The project allows Git: commands may commit (gitMetadata). */
  git?: boolean;
}

/** How a sandbox differs for one use. */
export interface SandboxMode {
  /**
   * For a terminal someone watches or types into (terminal-link.ts): colours and a real terminal
   * type, and the terminal stays its controlling one, so Ctrl+C reaches the program. It is the
   * sandbox's own pseudo-terminal, never the owner's, so there is nothing outside to type into.
   */
  terminal?: boolean;
  /** Git metadata is writable, apart from what runs programs (gitMetadata). */
  git?: boolean;
}

/**
 * The bubblewrap arguments: the whole system read-only, the project folder writable, its Git metadata
 * read-only unless the project allows Git, private home folders (sign-ins, keys) replaced by empty ones, private /tmp and /run, its
 * own process space, and no network unless asked.
 */
export function sandboxArguments(
  root: string,
  network: boolean,
  hidden: string[] = [],
  { terminal = false, git = false }: SandboxMode = {},
) {
  const args = ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp'];
  // /run holds sockets (session and system D-Bus, Docker, systemd) that could start programs outside
  // the sandbox; commands get an empty one. With network on, DNS settings stay readable.
  args.push('--tmpfs', '/run');
  if (network && existsSync('/run/systemd/resolve'))
    args.push('--ro-bind', '/run/systemd/resolve', '/run/systemd/resolve');
  for (const path of [...PRIVATE_HOME_ENTRIES.map((entry) => join(homedir(), entry)), ...hidden]) {
    if (!existsSync(path)) continue;
    if (statSync(path).isDirectory()) args.push('--tmpfs', path);
    else args.push('--ro-bind', '/dev/null', path);
  }
  args.push('--bind', root, root, ...gitMetadata(root, git));
  args.push('--unshare-pid', '--unshare-ipc', '--unshare-uts', '--unshare-cgroup-try');
  if (!network) args.push('--unshare-net');
  args.push('--die-with-parent', ...(terminal ? [] : ['--new-session']), '--chdir', root);
  args.push('--clearenv');
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: homedir(),
    USER: process.env.USER ?? '',
    LANG: process.env.LANG ?? 'C.UTF-8',
    TERM: terminal ? 'xterm-256color' : 'dumb',
    TMPDIR: '/tmp',
    XDG_CACHE_HOME: '/tmp/.cache',
    npm_config_cache: '/tmp/.npm',
    ...(terminal ? { COLORTERM: 'truecolor' } : { CI: '1', NO_COLOR: '1' }),
    GIT_TERMINAL_PROMPT: '0',
    ...(git ? gitIdentity(root) : {}),
  };
  for (const [name, value] of Object.entries(env)) args.push('--setenv', name, value);
  return args;
}

/** Runs one command in the sandbox and returns its exit code and (trimmed) output. */
export async function runCommand(
  root: string,
  args: ProjectToolArguments<'run_command'>,
  signal: AbortSignal,
  options: SandboxOptions = {},
  /** Called with all output so far whenever more arrives. */
  onOutput?: (output: string) => void,
) {
  const mode = { git: !!options.git };
  const argv = [...sandboxArguments(root, !!args.network, options.hidden, mode), '--'];
  argv.push('/bin/sh', '-c', args.command);
  return runProcess(options.bwrap ?? 'bwrap', argv, {}, args.timeout_seconds ?? 120, signal, {
    onOutput,
    missing: 'Commands need bubblewrap (bwrap) on this computer; none were run.',
  });
}

/** Where Git keeps what it runs or obeys: hooks, and config that can name programs to run. */
const GIT_RUNS = ['hooks', 'config', 'config.worktree'];

/**
 * Git metadata in the sandbox. Read-only by default. With Git allowed, commits, branches and the
 * index may change, but hooks and config stay as the owner left them, in the repository and in its
 * submodules and worktrees: a hook or `core.fsmonitor` a chat wrote would otherwise run, outside the
 * sandbox, the next time the owner used Git. A `.git` file (a worktree elsewhere) stays read-only.
 */
export function gitMetadata(root: string, writable: boolean) {
  const git = join(root, '.git');
  if (!existsSync(git)) return [];
  if (!writable || !statSync(git).isDirectory()) return ['--ro-bind', git, git];
  const args: string[] = [];
  for (const folder of [
    git,
    ...gitFolders(join(git, 'modules'), 3),
    ...gitFolders(join(git, 'worktrees'), 1),
  ])
    for (const entry of GIT_RUNS) {
      const path = join(folder, entry);
      // A missing one is held empty, so a chat cannot put one there.
      if (entry === 'hooks' && !existsSync(path)) mkdirSync(path);
      args.push('--ro-bind', existsSync(path) ? path : '/dev/null', path);
    }
  return args;
}

/** Git folders (those with a HEAD) under `folder`, up to `depth` levels down. */
function gitFolders(folder: string, depth: number): string[] {
  if (depth === 0 || !existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .flatMap((entry) => {
      const path = join(folder, entry.name);
      return existsSync(join(path, 'HEAD')) ? [path] : gitFolders(path, depth - 1);
    });
}

/**
 * The owner's Git name and email as Git sees them here, for commits in the sandbox: where they live
 * in a hidden folder (~/.config/git), Git there could not find them.
 */
function gitIdentity(root: string): Record<string, string> {
  const read = (key: string) =>
    spawnSync('git', ['-C', root, 'config', '--get', key], {
      encoding: 'utf8',
      timeout: 5_000,
    }).stdout?.trim() ?? '';
  const name = read('user.name');
  const email = read('user.email');
  return {
    ...(name ? { GIT_AUTHOR_NAME: name, GIT_COMMITTER_NAME: name } : {}),
    ...(email ? { GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_EMAIL: email } : {}),
  };
}
