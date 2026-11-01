import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { projectRoot } from '../../daemon/src/projects.ts';
import { openToolBridge } from '../../daemon/src/tool-bridge.ts';

// Runs on Linux, macOS and Windows (CI runs it on Windows too): the bridge Claude Code uses for the
// hub's tools, over a socket file or a named pipe.
let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'crewstead-bridge-'));
});
afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

it('passes a tool call from Claude Code’s side of the bridge to the computer service and back', async () => {
  const calls: string[] = [];
  const bridge = await openToolBridge(
    folder,
    [{ name: 'ping', description: 'Answers pong.', parameters: { type: 'object' } }],
    async (name, args) => {
      calls.push(`${name} ${args}`);
      return { text: 'pong', isError: false };
    },
  );
  try {
    // Started the way Claude Code starts it, from the config the bridge hands it.
    const server = (
      JSON.parse(bridge.config) as {
        mcpServers: { hub: { command: string; args: string[]; env: Record<string, string> } };
      }
    ).mcpServers.hub;
    const child = spawn(server.command, server.args, { env: { ...process.env, ...server.env } });
    const answers = createInterface({ input: child.stdout });
    const next = () =>
      new Promise<{ id: number; result: unknown }>((done) =>
        answers.once('line', (line) => done(JSON.parse(line))),
      );
    const ask = (id: number, method: string, params: object = {}) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      return next();
    };
    expect((await ask(1, 'initialize')).result).toMatchObject({
      serverInfo: { name: 'crewstead' },
    });
    expect((await ask(2, 'tools/list')).result).toMatchObject({ tools: [{ name: 'ping' }] });
    const called = await ask(3, 'tools/call', { name: 'ping', arguments: { loud: true } });
    expect(called.result).toMatchObject({ content: [{ type: 'text', text: 'pong' }] });
    expect(calls).toEqual(['ping {"loud":true}']);
    child.kill();
  } finally {
    await bridge.close();
  }
});

it.runIf(process.platform === 'win32')(
  'refuses Windows drive roots, system folders and AppData as projects',
  async () => {
    for (const path of ['C:\\', 'C:\\Windows', 'C:\\Program Files', 'C:\\Users', tmpdir()])
      expect(() => projectRoot(path), path).toThrow();
    const mine = await mkdtemp(join(homedir(), 'crewstead-project-'));
    try {
      expect(projectRoot(mine)).toBeTruthy();
    } finally {
      await rm(mine, { recursive: true, force: true });
    }
  },
);
