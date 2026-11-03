import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  machineFolder,
  machineProject,
  type MachineFolder,
  type MachineProject,
} from '@crewstead/core/protocol';

export interface MachineConfig {
  hub: string;
  token: string;
  /** This computer's id at the hub, as the hub says when it connects (for the desktop app). */
  machineId?: string;
  /** Project folders the owner registered here; the hub can only reach these. */
  projects?: MachineProject[];
  /** Folders the owner allowed here, inside which the hub may browse and add projects. */
  folders?: MachineFolder[];
  /** Whole-computer chats: off unless its owner turned them on here (`crewstead computer on`). */
  computer?: { enabled: boolean; commands: boolean; browser: boolean };
  /** Shells opened from the hub: off unless its owner turned them on here (`crewstead terminal on`). */
  terminals?: boolean;
  /** Claude Code accounts here; absent: just the usual sign-in (claude-accounts.ts). */
  claudeAccounts?: { id: string; name: string; folder: string | null }[];
}

/** The daemon's own folder; never Claude Code's or any other tool's configuration. */
export function machineHome(env = process.env) {
  if (env.HUB_MACHINE_HOME) return env.HUB_MACHINE_HOME;
  return named(
    join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config')),
    'crewstead-machine',
    'agent-hub-machine',
  );
}

export function readConfig(home: string): MachineConfig | undefined {
  try {
    const value = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')) as MachineConfig;
    if (typeof value.hub !== 'string' || typeof value.token !== 'string') return undefined;
    // Older files have projects without rules; they get the defaults.
    return {
      ...value,
      projects: (value.projects ?? []).map((project) => machineProject.parse(project)),
      folders: (value.folders ?? []).map((folder) => machineFolder.parse(folder)),
    };
  } catch {
    return undefined;
  }
}

/** Saved readable only by this user: the token lets the computer act for its owner. */
export function writeConfig(home: string, config: MachineConfig) {
  const file = join(home, 'config.json');
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

/** An empty folder Claude Code runs in, so no project files or project settings are picked up. */
export function workFolder(home: string) {
  const folder = join(home, 'work');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  return folder;
}

/** Accepts https anywhere and plain http only on this computer. */
export function hubUrl(value: string) {
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    throw new Error('The hub address must start with https:// (or http:// on this computer).');
  return url.origin;
}

/** The hub's own data folder on this computer, hidden from project commands like other private data. */
export function hubDataFolder(env = process.env) {
  return (
    env.HUB_DATA_DIR ?? named(join(env.HOME ?? homedir(), '.local/share'), 'crewstead', 'agent-hub')
  );
}

/** A folder by its Crewstead name, or by its name from before the rename while only that one exists. */
function named(parent: string, current: string, before: string) {
  const now = join(parent, current);
  return !existsSync(now) && existsSync(join(parent, before)) ? join(parent, before) : now;
}
