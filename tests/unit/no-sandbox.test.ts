import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { writeConfig } from '../../daemon/src/config.ts';
import { runProjectTool } from '../../daemon/src/tools/run.ts';

let root: string;
beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'hub-no-sandbox-')));
});
afterAll(() => rm(root, { recursive: true, force: true }));

it('runs a project command without a sandbox only as the owner allowed it, in the project', async () => {
  const home = join(root, 'home');
  writeConfig(home, {
    hub: 'http://127.0.0.1:1',
    token: 'unused',
    projects: [
      {
        id: 'p1',
        name: 'P',
        path: root,
        rules: { commands: true, network: false, browser: false },
      },
    ],
  });
  const run = (approval?: 'owner' | 'auto') =>
    runProjectTool(
      // As on a computer without bubblewrap.
      { home, sandbox: false },
      {
        type: 'tool',
        toolId: randomUUID(),
        projectId: 'p1',
        name: 'run_command',
        arguments: JSON.stringify({ command: 'pwd' }),
        session: randomUUID(),
        ...(approval ? { approval } : {}),
      },
      new AbortController().signal,
    );
  // Not run unless the owner allowed this very call: no reviewer, no "approve all", no read-only pass.
  for (const approval of [undefined, 'auto'] as const)
    expect(await run(approval)).toMatchObject({
      isError: true,
      output: 'Without a sandbox, only the owner can allow a command.',
    });
  expect(await run('owner')).toMatchObject({ isError: false, output: `Exit code: 0\n${root}` });
});
