import { homedir } from 'node:os';
import {
  COMPUTER_PLACE,
  type MachineCommand,
  type MachineTerminalCommand,
  type MachineTerminalEvents,
} from '@crewstead/core/protocol';
import { computerSettings, terminalsOn } from './computer.ts';
import { openProject } from './projects.ts';
import { sandboxArguments } from './tools/command.ts';
import { chatFolder, ownerEnv, SHELL } from './tools/computer.ts';
import type { ToolHost } from './tools/run.ts';

type Pty = import('node-pty').IPty;
/** Output is sent this often while it comes, or sooner when this much has gathered. */
const FLUSH_MS = 25;
const FLUSH_CHARS = 131_072;
/** Shells open at once on this computer. */
const MAX_SHELLS = 8;

let module: typeof import('node-pty') | null | undefined;
/** node-pty, when it is installed here (an optional dependency); terminals need it. */
export async function loadPty() {
  if (module === undefined) module = await import('node-pty').catch(() => null);
  return module;
}

/** How to start a program in a terminal. */
export interface Launch {
  file: string;
  argv: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface Running {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  /** Ends it, and everything it started. */
  kill(): void;
}

/**
 * The terminals running here, each streamed to the hub as it prints: shells the owner opens from the
 * hub (when they turned terminals on here) and background commands of chats (watch-link.ts).
 */
export function terminalLink(
  host: ToolHost,
  pty: typeof import('node-pty') | null,
  post: (body: MachineTerminalEvents) => Promise<void>,
) {
  const running = new Map<string, Running>();
  const shells = new Set<string>();

  /** Starts `how` in a terminal called `id`; `output` also hears what it prints, `exit` its end. */
  function run(
    id: string,
    how: Launch,
    size: { cols: number; rows: number },
    exit: (reason: string) => void,
    output?: (data: string) => void,
  ): Running {
    if (!pty)
      throw new Error('Terminals are not available on this computer (node-pty is missing).');
    const child: Pty = pty.spawn(how.file, how.argv, {
      name: 'xterm-256color',
      cols: size.cols,
      rows: size.rows,
      ...(how.cwd ? { cwd: how.cwd } : {}),
      env: (how.env ?? process.env) as Record<string, string>,
    });
    let pending = '';
    let timer: NodeJS.Timeout | undefined;
    const flush = (end?: string) => {
      clearTimeout(timer);
      timer = undefined;
      if (!pending && !end) return;
      const data = pending;
      pending = '';
      void post({ terminalId: id, data, ...(end ? { end } : {}) });
    };
    child.onData((data) => {
      output?.(data);
      pending += data;
      if (pending.length >= FLUSH_CHARS) flush();
      else timer ??= setTimeout(() => flush(), FLUSH_MS);
    });
    child.onExit(({ exitCode, signal }) => {
      const reason = signal ? `ended by signal ${signal}` : `exited with code ${exitCode}`;
      running.delete(id);
      shells.delete(id);
      flush(reason);
      exit(reason);
    });
    const handle: Running = {
      write: (data) => child.write(data),
      resize: (cols, rows) => child.resize(cols, rows),
      kill: () => {
        // The terminal leads its own process group: end all of it, not just the shell.
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill();
        }
      },
    };
    running.set(id, handle);
    return handle;
  }

  return {
    available: !!pty,
    run,
    /** Handles terminal commands; returns false for any other command. */
    handle(command: MachineCommand): command is MachineTerminalCommand {
      if (!command.type.startsWith('terminal_')) return false;
      const terminal = command as MachineTerminalCommand;
      const id = terminal.terminalId;
      // Typing needs terminals on here, also into a chat's background command (which may run as
      // the owner); watching it does not.
      if (terminal.type === 'terminal_input') {
        if (terminalsOn(host.home)) running.get(id)?.write(terminal.data);
      } else if (terminal.type === 'terminal_resize')
        running.get(id)?.resize(terminal.cols, terminal.rows);
      else if (terminal.type === 'terminal_close') running.get(id)?.kill();
      else
        try {
          if (shells.size >= MAX_SHELLS)
            throw new Error(`At most ${MAX_SHELLS} terminals are open at once on a computer.`);
          run(id, shellLaunch(host, terminal), terminal, () => undefined);
          shells.add(id);
        } catch (error) {
          void post({
            terminalId: id,
            data: '',
            end: (error instanceof Error ? error.message : 'It did not start.').slice(0, 300),
          });
        }
      return true;
    },
    stop() {
      for (const terminal of running.values()) terminal.kill();
    },
  };
}

/** A shell for the owner: in a project's sandbox, or as the owner on the whole computer. */
function shellLaunch(
  host: ToolHost,
  command: Extract<MachineTerminalCommand, { type: 'terminal_open' }>,
): Launch {
  if (!terminalsOn(host.home))
    throw new Error(
      'Terminals are off on this computer. Turn them on there, in the Crewstead app or with: crewstead terminal on',
    );
  const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL ?? SHELL);
  if (command.projectId === COMPUTER_PLACE) {
    if (!computerSettings(host.home).enabled)
      throw new Error('Whole-computer chats are turned off on this computer.');
    const cwd = command.session ? chatFolder(host, command.session) : homedir();
    return { file: shell, argv: [], cwd, env: ownerEnv(true) };
  }
  const project = openProject(host.home, command.projectId);
  if (!project.rules.commands) throw new Error('Commands are turned off for this project.');
  if (!host.sandbox) throw new Error('Commands cannot run on this computer (no sandbox).');
  const argv = sandboxArguments(project.path, project.rules.network, host.hidden, {
    terminal: true,
    git: !!project.rules.git,
  });
  // The owner's own shell may not exist inside the sandbox's view; a standard one always does.
  return { file: host.bwrap ?? 'bwrap', argv: [...argv, '--', SHELL, '-i'], cwd: project.path };
}

/** Escape sequences (colours, cursor moves, titles), removed from what the model reads. */
const ESCAPES =
  // eslint-disable-next-line no-control-regex -- terminal escape sequences are control characters
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|[\x00-\x08\x0b-\x1f]/g;

/**
 * Turns terminal output into plain lines for the model: without colours, and with a line that redraws
 * itself (a progress bar) kept as it ends.
 */
export function plainLines(line: (text: string) => void) {
  let partial = '';
  return (data: string) => {
    const parts = (partial + data).replace(/\r\n/g, '\n').split('\n');
    partial = parts.pop() ?? '';
    for (const part of parts) {
      const text = (part.split('\r').at(-1) ?? '').replace(ESCAPES, '').trimEnd();
      if (text) line(text);
    }
  };
}
