import { homedir } from 'node:os';
import type { MachineComputer } from '@crewstead/core/protocol';
import { readConfig, writeConfig } from './config.ts';

/** What its owner allows for whole-computer chats on this computer. */
export interface ComputerSettings {
  enabled: boolean;
  commands: boolean;
  browser: boolean;
}

const OFF: ComputerSettings = { enabled: false, commands: true, browser: true };

export function computerSettings(home: string): ComputerSettings {
  return { ...OFF, ...readConfig(home)?.computer };
}

/** What the hub hears: null while whole-computer chats are off here. */
export function computerHello(home: string, browserInstalled: boolean): MachineComputer | null {
  const settings = computerSettings(home);
  if (!settings.enabled) return null;
  return {
    home: homedir(),
    commands: settings.commands,
    browser: settings.browser && browserInstalled,
  };
}

/**
 * Changes the settings. From the hub only narrowing is allowed: it can turn whole-computer chats off,
 * or commands or the browser, but turning anything on is done here, at the computer.
 */
export function changeComputer(
  home: string,
  change: Partial<ComputerSettings>,
  from: 'hub' | 'computer',
): ComputerSettings {
  const config = readConfig(home);
  if (!config) throw new Error('Not set up yet. Run: crewstead connect <hub address>');
  const current = computerSettings(home);
  if (from === 'hub')
    for (const key of ['enabled', 'commands', 'browser'] as const)
      if (change[key] && !current[key])
        throw new Error(
          'Whole-computer access is turned on only at the computer itself: crewstead computer on',
        );
  const next = { ...current, ...change };
  writeConfig(home, { ...config, computer: next });
  return next;
}

/** `crewstead computer on|off|commands on|off|browser on|off`. */
export function computerCommand(home: string, args: string[]) {
  const [first, second] = args;
  const flag = (value: string | undefined) => {
    if (value !== 'on' && value !== 'off')
      throw new Error('Usage: crewstead computer on|off, or computer commands|browser on|off');
    return value === 'on';
  };
  const next =
    first === 'commands' || first === 'browser'
      ? changeComputer(home, { [first]: flag(second) }, 'computer')
      : changeComputer(home, { enabled: flag(first) }, 'computer');
  return describeComputer(next);
}

export function describeComputer(settings: ComputerSettings) {
  if (!settings.enabled) return 'off (crewstead computer on)';
  return `on: files${settings.commands ? ', commands' : ''}${settings.browser ? ', browser' : ''}`;
}
