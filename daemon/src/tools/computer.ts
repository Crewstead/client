import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  computerPath,
  PROTECTED_HOME_ENTRIES,
  PROTECTED_SYSTEM,
  protectedPlace,
  type MachineCommand,
  type MachineToolResult,
  type ProjectToolArguments,
  type ProjectToolName,
} from '@crewstead/core/protocol';
import { computerSettings } from '../computer.ts';
import { workFolder } from '../config.ts';
import type { AskPassword } from './askpass.ts';
import { runCommand } from './command.ts';
import {
  editProjectFile,
  listFiles,
  readProjectFile,
  showPicture,
  writeProjectFile,
} from './files.ts';
import { projectPath } from './paths.ts';
import { runProcess } from './process.ts';
import type { ToolHost } from './run.ts';
import { searchProject } from './search.ts';

type ToolCommand = Extract<MachineCommand, { type: 'tool' }>;
type FileTool = Exclude<ProjectToolName, 'run_command' | `browser_${string}`>;

/** The owner's shell for approved commands; bash, which models write best, where there is one. */
export const SHELL = existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';

/** How a command line runs as the owner: PowerShell on Windows, else the shell above. */
export function ownerShell(command: string) {
  return process.platform === 'win32'
    ? {
        file: 'powershell.exe',
        argv: ['-NoProfile', '-NonInteractive', '-Command', command],
      }
    : { file: SHELL, argv: ['-c', command] };
}

/**
 * Runs a file tool or command in a whole-computer chat. The owner's switches here hold whatever the hub
 * asks: private places need the owner's own approval, checked on the real path (after links), and only
 * approved commands run outside the sandbox.
 */
export async function runComputerTool(
  host: ToolHost,
  command: ToolCommand,
  args: Record<string, unknown>,
  signal: AbortSignal,
  onOutput?: (output: string) => void,
  askPassword?: AskPassword,
): Promise<{ output: string; diff?: string; image?: MachineToolResult['image'] }> {
  const settings = computerSettings(host.home);
  if (!settings.enabled) throw new Error('Whole-computer chats are turned off on this computer.');
  const home = homedir();
  if (command.name === 'run_command') {
    if (!settings.commands) throw new Error('Commands are turned off for whole-computer chats.');
    return computerCommand(host, command, args as ProjectToolArguments<'run_command'>, signal, {
      onOutput,
      askPassword,
    });
  }
  const name = command.name as FileTool;
  const path = computerPath(args.path as string | undefined, home);
  await checkPrivate(path, home, command.approval);
  const withPath = { ...args, path } as never;
  const apply = !command.preview;
  switch (name) {
    case 'edit_file':
      return editProjectFile('/', withPath, apply);
    case 'write_file':
      return writeProjectFile('/', withPath, apply);
    default:
      if (!apply) return { output: '' };
      if (name === 'list_files')
        return listFiles('/', withPath, (folder) => !!protectedPlace(folder, home));
      if (name === 'read_file') return readProjectFile('/', withPath);
      if (name === 'show_picture') return showPicture('/', withPath);
      return searchProject('/', withPath, signal, PROTECTED_HOME_ENTRIES);
  }
}

/** Refuses a private place unless the owner approved this very call. */
async function checkPrivate(path: string, home: string, approval: ToolCommand['approval']) {
  if (approval === 'owner') return;
  const { real } = await projectPath('/', path);
  const place = protectedPlace(path, home) ?? protectedPlace(real, realHome(home));
  if (place)
    throw new Error(
      `${path} is in a private place (${place}). Only the owner can allow that, each time; ` +
        'call the tool again with its real path so the hub asks them.',
    );
}

const realHome = (home: string) => {
  try {
    return realpathSync(home);
  } catch {
    return home;
  }
};

/**
 * A whole-computer chat's command, from the home folder. Approved ones run as the owner, with the
 * owner's access and network; others (read-only commands the hub let through without asking) run in
 * the sandbox, where everything but the chat's scratch folder is read-only, private places are hidden
 * and the network is off.
 */
async function computerCommand(
  host: ToolHost,
  command: ToolCommand,
  args: ProjectToolArguments<'run_command'>,
  signal: AbortSignal,
  {
    onOutput,
    askPassword,
  }: { onOutput?: ((output: string) => void) | undefined; askPassword?: AskPassword | undefined },
) {
  if (command.preview) return { output: '' };
  // Like a terminal, commands start in the owner's home folder. The sandbox writes only its scratch
  // folder (in this service's settings), so it is never where the owner's things end up.
  if (!command.approval) {
    if (!host.sandbox) throw new Error('This command needs the owner’s approval.');
    const scratch = chatFolder(host, command.session);
    const hidden = computerHidden(host);
    const sandbox = { ...host, hidden, computer: true, start: homedir() };
    return runCommand(scratch, { ...args, network: false }, signal, sandbox, onOutput);
  }
  return ownerCommand(host, homedir(), args, signal, { onOutput, askPassword });
}

/**
 * A command the owner approved, run as the owner in `cwd` with the owner's access and network: in a
 * whole-computer chat, or in a project on a computer without a sandbox.
 */
export async function ownerCommand(
  host: ToolHost,
  cwd: string,
  args: ProjectToolArguments<'run_command'>,
  signal: AbortSignal,
  {
    onOutput,
    askPassword,
  }: { onOutput?: ((output: string) => void) | undefined; askPassword?: AskPassword | undefined },
) {
  const shell = ownerShell(args.command);
  const env = ownerEnv();
  // sudo asks the owner in the app; the model only sees that it asked.
  const sudo = askPassword && host.askpass?.session(env.PATH, askPassword);
  try {
    return await runProcess(
      shell.file,
      shell.argv,
      {
        cwd,
        env: { ...env, ...sudo?.env },
        detached: process.platform !== 'win32',
        windowsHide: true,
      },
      args.timeout_seconds ?? 120,
      signal,
      { onOutput, missing: `${shell.file} is missing on this computer.` },
    );
  } finally {
    sudo?.end();
  }
}

/**
 * A whole-computer chat's scratch folder: the one folder its sandboxed commands may write (they start
 * in the home folder). Windows' sandbox user cannot read the home folder, so they start here there.
 */
export function chatFolder(host: ToolHost, session: string | undefined) {
  if (!/^[0-9a-f-]{36}$/.test(session ?? ''))
    throw new Error('Commands need the chat they belong to.');
  const cwd = join(workFolder(host.home), 'chats', session!);
  mkdirSync(cwd, { recursive: true, mode: 0o700 });
  return cwd;
}

/** What the sandbox hides from a whole-computer chat's unapproved commands: every private place. */
export const computerHidden = (host: ToolHost) => [
  ...(host.hidden ?? []),
  ...PROTECTED_HOME_ENTRIES.map((entry) => join(homedir(), entry)),
  ...PROTECTED_SYSTEM,
];

/** The owner's environment for approved commands, without the hub's own settings. */
export function ownerEnv(terminal = false) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('HUB_')),
  );
  // In a terminal someone watches, programs may colour and ask (it is the owner's own shell).
  if (terminal) return Object.assign(env, { TERM: 'xterm-256color', COLORTERM: 'truecolor' });
  return Object.assign(env, { TERM: 'dumb', CI: '1', NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0' });
}
