import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
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
}

/**
 * The bubblewrap arguments: the whole system read-only, the project folder writable, its Git metadata
 * read-only, private home folders (sign-ins, keys) replaced by empty ones, private /tmp and /run, its
 * own process space, and no network unless asked.
 */
export function sandboxArguments(
  root: string,
  network: boolean,
  hidden: string[] = [],
  /**
   * For a terminal someone watches or types into (terminal-link.ts): colours and a real terminal
   * type, and the terminal stays its controlling one, so Ctrl+C reaches the program. It is the
   * sandbox's own pseudo-terminal, never the owner's, so there is nothing outside to type into.
   */
  terminal = false,
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
  args.push('--bind', root, root);
  if (existsSync(join(root, '.git')))
    args.push('--ro-bind', join(root, '.git'), join(root, '.git'));
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
  const argv = [...sandboxArguments(root, !!args.network, options.hidden), '--'];
  argv.push('/bin/sh', '-c', args.command);
  return runProcess(options.bwrap ?? 'bwrap', argv, {}, args.timeout_seconds ?? 120, signal, {
    onOutput,
    missing: 'Commands need bubblewrap (bwrap) on this computer; none were run.',
  });
}
