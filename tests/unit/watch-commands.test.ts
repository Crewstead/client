import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MachineWatchEvents } from '@crewstead/core/protocol';
import { writeConfig } from '../../daemon/src/config.ts';
import { sandboxAvailable } from '../../daemon/src/tools/command.ts';
import { watchCommands } from '../../daemon/src/watch-link.ts';

let root: string;
let home: string;
let posted: MachineWatchEvents[];
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hub-watch-'));
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
const linesOf = () => posted.flatMap((body) => body.lines);
const endOf = () => posted.find((body) => body.end)?.end;
const start = (link: ReturnType<typeof watchCommands>, command: string, extra = {}) =>
  link.handle({
    type: 'watch',
    watchId: 'wa1b2c3',
    projectId: 'shop1',
    command,
    session: '00000000-0000-4000-8000-000000000000',
    minutes: 5,
    ...extra,
  });

it.skipIf(!sandboxAvailable())(
  'runs a project’s background command in its sandbox and streams its lines and end',
  async () => {
    const link = watchCommands({ home, sandbox: true }, async (body) => void posted.push(body));
    start(link, 'echo first; sleep 1; echo second >&2');
    await vi.waitFor(() => expect(endOf()).toBe('exited with code 0'), { timeout: 10_000 });
    expect(linesOf()).toEqual(['first', 'second']);
  },
);

it.skipIf(!sandboxAvailable())(
  'stops a command when asked, and keeps the project’s rules',
  async () => {
    const link = watchCommands({ home, sandbox: true }, async (body) => void posted.push(body));
    start(link, 'while true; do echo tick; sleep 0.2; done');
    await vi.waitFor(() => expect(linesOf().length).toBeGreaterThan(1), { timeout: 10_000 });
    link.handle({ type: 'watch_stop', watchId: 'wa1b2c3' });
    await vi.waitFor(() => expect(endOf()).toMatch(/^ended by SIGKILL|exited with code/), {
      timeout: 10_000,
    });
    posted = [];
    start(link, 'curl https://example.com', { network: true });
    expect(endOf()).toBe('Network access is turned off for this project.');
  },
);
