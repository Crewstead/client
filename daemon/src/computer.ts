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

/** Whether the owner turned on shells opened from the hub, here (terminal-link.ts). */
export function terminalsOn(home: string) {
  return readConfig(home)?.terminals === true;
}

/** Turns shells from the hub on or off. From the hub, only off: on is said at the computer. */
export function changeTerminals(home: string, on: boolean, from: 'hub' | 'computer') {
  const config = readConfig(home);
  if (!config) throw new Error('Not set up yet. Run: crewstead connect <hub address>');
  if (from === 'hub' && on && !config.terminals)
    throw new Error('Terminals are turned on only at the computer itself: crewstead terminal on');
  writeConfig(home, { ...config, terminals: on });
  return on;
}

/** `crewstead terminal on|off`. */
export function terminalCommand(home: string, args: string[]) {
  if (args[0] !== 'on' && args[0] !== 'off') throw new Error('Usage: crewstead terminal on|off');
  return changeTerminals(home, args[0] === 'on', 'computer')
    ? 'on: you can open shells here from Crewstead, in projects and (when on) the whole computer'
    : 'off';
}
