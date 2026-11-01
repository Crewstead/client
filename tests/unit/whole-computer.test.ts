import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineTool, runTurn, ToolRegistry, type Provider } from '@crewstead/core/agent-runtime';
import {
  computerPath,
  mentionsProtected,
  protectedPlace,
  type RuntimeEvent,
} from '@crewstead/core/protocol';
import { changeComputer } from '../../daemon/src/computer.ts';
import { writeConfig } from '../../daemon/src/config.ts';
import { sandboxAvailable } from '../../daemon/src/tools/command.ts';
import { runProjectTool } from '../../daemon/src/tools/run.ts';

describe('paths and private places', () => {
  it('reads "~", relative and absolute paths from the home folder', () => {
    expect(computerPath(undefined, '/home/a')).toBe('/home/a');
    expect(computerPath('~/x/../y', '/home/a')).toBe('/home/a/y');
    expect(computerPath('docs', '/home/a')).toBe('/home/a/docs');
    expect(computerPath('/etc/hosts', '/home/a')).toBe('/etc/hosts');
  });
  it('knows private places, but not the folders that contain them', () => {
    expect(protectedPlace('/home/a/.ssh/id_ed25519', '/home/a')).toBe('/home/a/.ssh');
    expect(protectedPlace('/home/a/.local/share/crewstead/x', '/home/a')).toBeTruthy();
    expect(protectedPlace('/etc/shadow', '/home/a')).toBe('/etc/shadow');
    expect(protectedPlace('/home/a', '/home/a')).toBeUndefined();
    expect(protectedPlace('/home/a/Projects/vite.config.ts', '/home/a')).toBeUndefined();
  });
  it('spots private places named in a command, not names that only look alike', () => {
    expect(mentionsProtected('cat ~/.ssh/id_rsa', '/home/a')).toBe(true);
    expect(mentionsProtected('ls $HOME/.config', '/home/a')).toBe(true);
    expect(mentionsProtected('cat /home/a/.aws/credentials', '/home/a')).toBe(true);
    expect(mentionsProtected('npx vite build --config vite.config.ts', '/home/a')).toBe(false);
  });
});

describe('the computer enforces its own rules', () => {
  let root: string;
  let machine: string;
  let home: string;
  const homeBefore = process.env.HOME;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'hub-computer-'));
    machine = join(root, 'machine');
    home = join(root, 'home');
    await mkdir(join(home, '.ssh'), { recursive: true });
    await writeFile(join(home, '.ssh', 'key'), 'fixture key, not a real one');
    await writeFile(join(home, 'notes.md'), 'hello\n');
    await symlink(join(home, '.ssh'), join(home, 'keys'));
    process.env.HOME = home;
    writeConfig(machine, { hub: 'http://127.0.0.1:1', token: 'fixture' });
  });
  afterEach(async () => {
    process.env.HOME = homeBefore;
    await rm(root, { recursive: true, force: true });
  });
  const run = (name: string, args: object, approval?: 'owner' | 'auto') =>
    runProjectTool(
      { home: machine, sandbox: sandboxAvailable() },
      {
        type: 'tool',
        toolId: randomUUID(),
        projectId: 'computer',
        name: name as never,
        arguments: JSON.stringify(args),
        session: randomUUID(),
        ...(approval ? { approval } : {}),
      },
      new AbortController().signal,
    );

  it('is off until the owner turns it on at the computer, and the hub can only narrow it', async () => {
    expect((await run('read_file', { path: '~/notes.md' })).output).toMatch(/turned off/);
    expect(() => changeComputer(machine, { enabled: true }, 'hub')).toThrow(/only at the computer/);
    changeComputer(machine, { enabled: true }, 'computer');
    changeComputer(machine, { commands: false }, 'hub');
    expect(() => changeComputer(machine, { commands: true }, 'hub')).toThrow(
      /only at the computer/,
    );
    expect((await run('run_command', { command: 'ls' }, 'owner')).output).toMatch(/turned off/);
  });

  it('reads freely, but a private place only with the owner’s approval, links included', async () => {
    changeComputer(machine, { enabled: true }, 'computer');
    const notes = await run('read_file', { path: '~/notes.md' });
    expect(notes).toMatchObject({ isError: false });
    expect(notes.output).toContain('hello');
    for (const path of ['~/.ssh/key', '~/keys/key']) {
      const refused = await run('read_file', { path }, 'auto');
      expect(refused.isError).toBe(true);
      expect(refused.output).toMatch(/private place/);
    }
    expect((await run('read_file', { path: '~/.ssh/key' }, 'owner')).output).toContain('fixture');
    const listed = (await run('list_files', {})).output;
    expect(listed).toContain(`${home}/.ssh/ (private`);
    expect(listed).not.toContain('.ssh/key');
  });

  it.skipIf(!sandboxAvailable())(
    'runs unapproved commands in the sandbox and approved ones as the owner',
    async () => {
      changeComputer(machine, { enabled: true }, 'computer');
      const target = join(root, 'made-by-command');
      const sandboxed = await run('run_command', { command: `touch ${target}; cat ~/.ssh/key` });
      expect(sandboxed.output).not.toContain('fixture');
      expect(existsSync(target)).toBe(false);
      const approved = await run('run_command', { command: `touch ${target} && pwd` }, 'auto');
      expect(approved.output).toContain('Exit code: 0');
      expect(approved.output).toContain(join(machine, 'work', 'chats'));
      expect(existsSync(target)).toBe(true);
    },
  );
});

describe('owner-only approval', () => {
  it('asks the owner for a private place even when everything else is approved automatically', async () => {
    const run = vi.fn(async (_approval?: string) => 'done');
    const tool = defineTool<object>({
      name: 'peek',
      description: 'Test',
      parameters: { type: 'object' },
      requiresApproval: true,
      ownerOnly: () => true,
      parse: (input) => input as object,
      describe: () => 'Peek',
      run: (_args, _signal, _progress, approval) => run(approval),
    });
    let step = 0;
    const provider: Provider = {
      async *stream() {
        if (step++) return;
        yield { type: 'tool_call', callId: 'c1', name: 'peek', arguments: '{}' };
      },
    };
    const requestApproval = vi.fn(async () => true);
    const events: RuntimeEvent[] = [];
    await runTurn(
      [{ type: 'message', role: 'user', text: 'go' }],
      provider,
      new ToolRegistry([tool]),
      {
        publish: (event) => events.push(event),
        delta: () => {},
        requestApproval,
        approvalMode: () => 'all',
      },
      new AbortController().signal,
    );
    expect(requestApproval).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith('owner');
  });
});
