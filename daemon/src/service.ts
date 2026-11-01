import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Installs Crewstead on this computer as the `crewstead` command and a systemd user service, so it
 * starts with the computer and needs no terminal. Linux only for now; both go in the user's own
 * folders, nothing system-wide.
 */
export const SERVICE = 'crewstead-machine';
/** Exit code meaning "do not restart": the hub removed this computer, or it is not set up. */
export const STOPPED_FOR_GOOD = 3;

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

export function servicePaths(env = process.env) {
  const home = env.HOME ?? homedir();
  return {
    command: join(home, '.local/bin/crewstead'),
    unit: join(env.XDG_CONFIG_HOME ?? join(home, '.config'), 'systemd/user', `${SERVICE}.service`),
  };
}

/** The `crewstead` launcher: this Node, the TypeScript loader and the daemon, by absolute path. */
export function launcher() {
  const tsx = import.meta.resolve('tsx');
  return [
    '#!/bin/sh',
    '# Crewstead on this computer. Installed by `crewstead install`; remove with `crewstead uninstall`.',
    `exec ${quote(process.execPath)} --import ${quote(tsx)} ${quote(MAIN)} "$@"`,
    '',
  ].join('\n');
}

/**
 * The user service. It keeps the PATH of the install, so it finds `claude`, `bwrap` and `rg` the way
 * the terminal did, and it is not restarted when the hub removed this computer.
 */
export function unit(command: string, home: string, path = process.env.PATH ?? '') {
  return [
    '[Unit]',
    'Description=Crewstead on this computer',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    `ExecStart=${command} run`,
    `Environment=PATH=${path.replaceAll('%', '%%')}`,
    `Environment=HUB_MACHINE_HOME=${home.replaceAll('%', '%%')}`,
    'Restart=on-failure',
    'RestartSec=5',
    `RestartPreventExitStatus=${STOPPED_FOR_GOOD}`,
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;
const systemctl = (...args: string[]) =>
  execFileSync('systemctl', ['--user', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim();

function requireSystemd() {
  if (process.platform !== 'linux' || spawnSync('systemctl', ['--user', '--version']).status !== 0)
    throw new Error('Running in the background needs systemd user services (Linux) for now.');
}

/** Writes the command and the service, then starts it if this computer is already connected. */
export function install(home: string, connected: boolean) {
  requireSystemd();
  const paths = servicePaths();
  mkdirSync(dirname(paths.command), { recursive: true });
  writeFileSync(paths.command, launcher(), { mode: 0o755 });
  chmodSync(paths.command, 0o755);
  mkdirSync(dirname(paths.unit), { recursive: true });
  writeFileSync(paths.unit, unit(paths.command, home), { mode: 0o644 });
  systemctl('daemon-reload');
  systemctl('enable', SERVICE);
  if (connected) systemctl('restart', SERVICE);
  return paths;
}

export function uninstall() {
  const paths = servicePaths();
  if (existsSync(paths.unit)) {
    spawnSync('systemctl', ['--user', 'disable', '--now', SERVICE]);
    rmSync(paths.unit);
    spawnSync('systemctl', ['--user', 'daemon-reload']);
  }
  rmSync(paths.command, { force: true });
  return paths;
}

/** Whether the service is installed and running; undefined without systemd. */
export function serviceState(): { installed: boolean; running: boolean } | undefined {
  if (spawnSync('systemctl', ['--user', '--version']).status !== 0) return undefined;
  const installed = existsSync(servicePaths().unit);
  const active = spawnSync('systemctl', ['--user', 'is-active', SERVICE]).stdout?.toString().trim();
  return { installed, running: active === 'active' };
}

/** Restarts the service when it is installed, e.g. after connecting it to another hub. */
export function restartIfInstalled() {
  if (!serviceState()?.installed) return false;
  systemctl('restart', SERVICE);
  return true;
}

/** Follows the service's log until interrupted. */
export function followLogs() {
  requireSystemd();
  spawnSync('journalctl', ['--user', '-u', SERVICE, '-n', '50', '-f', '-o', 'cat'], {
    stdio: 'inherit',
  });
}
