import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineTerminalEvents, MachineWatchEvents } from '@crewstead/core/protocol';
import { changeTerminals } from '../../daemon/src/computer.ts';
import { readConfig, writeConfig } from '../../daemon/src/config.ts';
import { loadPty, plainLines, terminalLink } from '../../daemon/src/terminal-link.ts';
import { sandboxAvailable } from '../../daemon/src/tools/command.ts';
import { watchCommands } from '../../daemon/src/watch-link.ts';

const pty = await loadPty();
const sandbox = sandboxAvailable();
let root: string;
let home: string;
let posted: MachineTerminalEvents[];
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hub-terminal-'));
  home = join(root, 'machine');
  const rules = { commands: true, network: false, browser: false };
  writeConfig(home, {
    hub: 'http://127.0.0.1:1',
    token: 'fixture',
    projects: [{ id: 'shop1', name: 'Shop', path: root, rules }],
  });
  posted = [];
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const printed = () => posted.map((body) => body.data).join('');
const endOf = () => posted.find((body) => body.end)?.end;
const link = () => terminalLink({ home, sandbox }, pty, async (body) => void posted.push(body));
const open = (terminals: ReturnType<typeof link>) =>
  terminals.handle({
    type: 'terminal_open',
    terminalId: 'ta1b2c3',
    projectId: 'shop1',
    cols: 80,
    rows: 24,
  });

describe('plain lines for the model', () => {
  it('drops colours, keeps a redrawn line as it ends, and joins split chunks', () => {
    const lines: string[] = [];
    const feed = plainLines((line) => lines.push(line));
    feed('\x1b[32mVITE\x1b[0m ready\r\nbuil');
    feed('ding 10%\rbuilding 100%\n\x1b]0;title\x07done\n');
    expect(lines).toEqual(['VITE ready', 'building 100%', 'done']);
  });
});

describe.skipIf(!pty || !sandbox)('terminals on a computer', () => {
  it('opens no shell until the owner turns terminals on here', async () => {
    open(link());
    await vi.waitFor(() => expect(endOf()).toMatch(/^Terminals are off on this computer/));
    expect(() => changeTerminals(home, true, 'hub')).toThrow(/only at the computer itself/);
  });

  it('runs a shell in the project sandbox that takes typing, resizes and closes', async () => {
    changeTerminals(home, true, 'computer');
    const terminals = link();
    open(terminals);
    terminals.handle({ type: 'terminal_input', terminalId: 'ta1b2c3', data: 'echo $((6*7))\r' });
    await vi.waitFor(() => expect(printed()).toContain('42\r\n'), { timeout: 10_000 });
    // Ctrl+C ends the running command, not the shell.
    terminals.handle({ type: 'terminal_input', terminalId: 'ta1b2c3', data: 'sleep 30\r' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    terminals.handle({
      type: 'terminal_input',
      terminalId: 'ta1b2c3',
      data: '\x03echo still-here\r',
    });
    await vi.waitFor(() => expect(printed()).toContain('still-here\r\n'), { timeout: 10_000 });
    expect(endOf()).toBeUndefined();
    terminals.handle({ type: 'terminal_resize', terminalId: 'ta1b2c3', cols: 100, rows: 30 });
    terminals.handle({ type: 'terminal_input', terminalId: 'ta1b2c3', data: 'stty size\r' });
    await vi.waitFor(() => expect(printed()).toContain('30 100'), { timeout: 10_000 });
    // The sandbox: Git metadata and private folders stay out of reach, as for the model's commands.
    terminals.handle({
      type: 'terminal_input',
      terminalId: 'ta1b2c3',
      data: 'echo ssh=$(ls -A ~/.ssh 2>/dev/null | wc -l)\r',
    });
    await vi.waitFor(() => expect(printed()).toMatch(/ssh=0\r\n/), { timeout: 10_000 });
    terminals.handle({ type: 'terminal_close', terminalId: 'ta1b2c3' });
    await vi.waitFor(() => expect(endOf()).toBeDefined(), { timeout: 10_000 });
  });

  it('opens a whole-computer shell only when that is on, as the owner in the chat’s folder', async () => {
    changeTerminals(home, true, 'computer');
    const terminals = link();
    const session = '00000000-0000-4000-8000-000000000001';
    const whole = () =>
      terminals.handle({
        type: 'terminal_open',
        terminalId: 'tb1b2c3',
        projectId: 'computer',
        session,
        cols: 80,
        rows: 24,
      });
    whole();
    await vi.waitFor(() =>
      expect(endOf()).toBe('Whole-computer chats are turned off on this computer.'),
    );
    posted = [];
    writeConfig(home, {
      ...readConfig(home)!,
      computer: { enabled: true, commands: true, browser: false },
    });
    // The owner's own shell, here a plain one (a real one may start a set-up wizard).
    vi.stubEnv('SHELL', '/bin/sh');
    whole();
    terminals.handle({ type: 'terminal_input', terminalId: 'tb1b2c3', data: 'echo where=$PWD\r' });
    await vi.waitFor(
      () => expect(printed()).toContain(`where=${join(home, 'work', 'chats', session)}`),
      {
        timeout: 10_000,
      },
    );
    terminals.stop();
    vi.unstubAllEnvs();
  });

  it('runs a background command as a terminal: Ctrl+C ends it, the model still gets plain lines', async () => {
    const terminals = link();
    changeTerminals(home, true, 'computer');
    const watched: MachineWatchEvents[] = [];
    const watches = watchCommands(
      { home, sandbox },
      async (body) => void watched.push(body),
      terminals,
    );
    watches.handle({
      type: 'watch',
      watchId: 'wa1b2c3',
      projectId: 'shop1',
      command: 'printf "\\033[31mred\\033[0m\\n"; while true; do sleep 0.1; done',
      session: '00000000-0000-4000-8000-000000000000',
      minutes: 5,
    });
    await vi.waitFor(() => expect(printed()).toContain('\x1b[31mred'), { timeout: 10_000 });
    // Typing needs terminals on at the computer, also into a background command.
    changeTerminals(home, false, 'hub');
    terminals.handle({ type: 'terminal_input', terminalId: 'wa1b2c3', data: '\x03' });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(watched.find((body) => body.end)).toBeUndefined();
    changeTerminals(home, true, 'computer');
    terminals.handle({ type: 'terminal_input', terminalId: 'wa1b2c3', data: '\x03' });
    await vi.waitFor(() => expect(watched.find((body) => body.end)?.end).toBeDefined(), {
      timeout: 10_000,
    });
    expect(watched.flatMap((body) => body.lines)).toEqual(['red']);
  });
});
