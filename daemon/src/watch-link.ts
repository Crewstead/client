import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  COMPUTER_PLACE,
  type MachineCommand,
  type MachineWatchEvents,
} from '@crewstead/core/protocol';
import { computerSettings } from './computer.ts';
import { openProject } from './projects.ts';
import { sandboxArguments } from './tools/command.ts';
import { chatFolder, computerHidden, ownerEnv, ownerShell } from './tools/computer.ts';
import type { ToolHost } from './tools/run.ts';
import { plainLines, type terminalLink } from './terminal-link.ts';

type WatchCommand = Extract<MachineCommand, { type: 'watch' }>;
const MAX_MINUTES = 120;
const FLUSH_MS = 1_000;
const BATCH = 500;

/**
 * Background commands for watches (watch_start): run where the chat's commands run, under the same
 * rules (a project's sandbox and switches; on the whole computer, as the owner only when approved),
 * with their output sent to the hub a second at a time until they end, time out or are stopped.
 */
export function watchCommands(
  host: ToolHost,
  post: (body: MachineWatchEvents) => Promise<void>,
  /** Where it runs as a terminal the owner can open and type into, when terminals work here. */
  terminals?: ReturnType<typeof terminalLink>,
) {
  const running = new Map<string, () => void>();
  return {
    /** Handles watch commands; returns false for any other command. */
    handle(command: MachineCommand) {
      if (command.type === 'watch_stop') running.get(command.watchId)?.();
      else if (command.type === 'watch') {
        try {
          running.set(
            command.watchId,
            start(host, command, post, () => running.delete(command.watchId), terminals),
          );
        } catch (error) {
          void post({
            watchId: command.watchId,
            lines: [],
            end: (error instanceof Error ? error.message : 'It did not start.').slice(0, 300),
          });
        }
      } else return false;
      return true;
    },
    stop() {
      for (const stop of running.values()) stop();
    },
  };
}

/** How to start it: the program and arguments, under the place's rules; `terminal` for a pty. */
function launch(host: ToolHost, command: WatchCommand, terminal: boolean) {
  if (command.projectId === COMPUTER_PLACE) {
    const settings = computerSettings(host.home);
    if (!settings.enabled || !settings.commands)
      throw new Error('Commands are turned off for whole-computer chats.');
    const cwd = chatFolder(host, command.session);
    if (command.approval)
      return {
        ...ownerShell(command.command),
        cwd,
        env: ownerEnv(terminal),
        // Windows has no process groups (and a detached program there opens a console window).
        group: process.platform !== 'win32',
      };
    if (!host.sandbox) throw new Error('This command needs the owner’s approval.');
    const argv = [...sandboxArguments(cwd, false, computerHidden(host), { terminal }), '--'];
    return { file: host.bwrap ?? 'bwrap', argv: [...argv, '/bin/sh', '-c', command.command] };
  }
  const project = openProject(host.home, command.projectId);
  if (!project.rules.commands) throw new Error('Commands are turned off for this project.');
  if (command.network && !project.rules.network)
    throw new Error('Network access is turned off for this project.');
  if (!host.sandbox) throw new Error('Commands cannot run on this computer (no sandbox).');
  const argv = [
    ...sandboxArguments(project.path, !!command.network, host.hidden, {
      terminal,
      git: !!project.rules.git,
    }),
    '--',
  ];
  return { file: host.bwrap ?? 'bwrap', argv: [...argv, '/bin/sh', '-c', command.command] };
}

function start(
  host: ToolHost,
  command: WatchCommand,
  post: (body: MachineWatchEvents) => Promise<void>,
  done: () => void,
  terminals?: ReturnType<typeof terminalLink>,
) {
  const how = launch(host, command, !!terminals?.available);
  if (terminals?.available) return inTerminal(command, how, post, done, terminals);
  const child: ChildProcess = spawn(how.file, how.argv, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...('cwd' in how ? { cwd: how.cwd, env: how.env, detached: how.group } : {}),
  });
  let lines: string[] = [];
  let ended = false;
  const flush = (end?: string) => {
    if (!lines.length && !end) return;
    const batch = lines.splice(0, BATCH);
    if (lines.length) batch.push(`… ${lines.length} more lines left out.`);
    lines = [];
    void post({ watchId: command.watchId, lines: batch, ...(end ? { end } : {}) });
  };
  const timer = setInterval(() => flush(), FLUSH_MS);
  const add = (line: string) => lines.length <= BATCH && lines.push(line.slice(0, 4_000));
  for (const stream of [child.stdout!, child.stderr!])
    createInterface({ input: stream }).on('line', add);
  const kill = () => {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      return;
    }
    if ('group' in how && how.group && child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
        return;
      } catch {
        // Not a group leader any more: end the program itself.
      }
    }
    child.kill('SIGKILL');
  };
  const limit = setTimeout(kill, Math.min(command.minutes, MAX_MINUTES) * 60_000);
  const finish = (end: string) => {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    clearTimeout(limit);
    flush(end);
    done();
  };
  child.on('error', (error: NodeJS.ErrnoException) =>
    finish(error.code === 'ENOENT' ? `${how.file} is missing on this computer` : error.message),
  );
  child.on('close', (code, signal) =>
    finish(signal ? `ended by ${signal}` : `exited with code ${code}`),
  );
  return kill;
}

/** The same, in a terminal: the model gets plain lines, the owner the terminal to watch or type in. */
function inTerminal(
  command: WatchCommand,
  how: ReturnType<typeof launch>,
  post: (body: MachineWatchEvents) => Promise<void>,
  done: () => void,
  terminals: ReturnType<typeof terminalLink>,
) {
  let lines: string[] = [];
  const flush = (end?: string) => {
    if (!lines.length && !end) return;
    const batch = lines.splice(0, BATCH);
    if (lines.length) batch.push(`… ${lines.length} more lines left out.`);
    lines = [];
    void post({ watchId: command.watchId, lines: batch, ...(end ? { end } : {}) });
  };
  const timer = setInterval(() => flush(), FLUSH_MS);
  const add = (line: string) => lines.length <= BATCH && lines.push(line.slice(0, 4_000));
  // The end always comes later (an event), so `limit` is set by then.
  const running = terminals.run(
    command.watchId,
    { file: how.file, argv: how.argv, ...('cwd' in how ? { cwd: how.cwd, env: how.env } : {}) },
    { cols: 120, rows: 30 },
    (reason) => {
      clearInterval(timer);
      clearTimeout(limit);
      flush(reason);
      done();
    },
    plainLines(add),
  );
  const limit = setTimeout(() => running.kill(), Math.min(command.minutes, MAX_MINUTES) * 60_000);
  return () => running.kill();
}
