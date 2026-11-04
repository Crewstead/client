import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { writeConfig } from '../../daemon/src/config.ts';
import { launcher } from '../../daemon/src/service.ts';
import { APP_SERVICE, stopLeftoverServices } from '../../desktop/src/leftovers.ts';

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
const ended = (child: ReturnType<typeof spawn>) =>
  new Promise<void>((resolve) =>
    child.exitCode !== null || child.signalCode !== null
      ? resolve()
      : child.once('exit', () => resolve()),
  );

it('stops services an earlier run of the app left behind, and only those', async () => {
  // Stand-ins whose command lines look like the app's service; a unique folder keeps the user's own
  // running service out of this test.
  const folder = `/tmp/leftover-${process.pid}-${Date.now()}/resources/app.asar.unpacked`;
  const service = (action: string) =>
    spawn(process.execPath, [
      '-e',
      'setInterval(() => {}, 1000)',
      `${folder}/build/daemon/main.mjs`,
      action,
    ]);
  const left = service('run');
  const kept = service('run');
  const other = service('status');
  const unique = new RegExp(`${folder.replaceAll('/', '[\\\\/]')}[\\\\/]build`);
  const ours = (entry: string) => unique.test(entry) && APP_SERVICE.test(entry);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const stopped = await stopLeftoverServices(kept.pid, { test: ours } as RegExp);
  expect(stopped).toEqual([left.pid]);
  await ended(left);
  expect(kept.exitCode).toBeNull();
  expect(other.exitCode).toBeNull();
  kept.kill();
  other.kill();
  await Promise.all([ended(kept), ended(other)]);
});

it('stops the app’s service when the app’s pipe closes, however the app ended', async () => {
  root = await mkdtemp(join(tmpdir(), 'hub-app-service-'));
  const home = join(root, 'machine');
  // A hub that never answers: the service keeps trying to reach it until it is stopped.
  writeConfig(home, { hub: 'http://127.0.0.1:9', token: 'test-token' });
  const command = join(root, 'crewstead');
  await writeFile(command, launcher());
  await chmod(command, 0o755);
  const child = spawn(command, ['run'], {
    cwd: root,
    env: { ...process.env, HUB_MACHINE_HOME: home, CREWSTEAD_APP_PIPE: '1' },
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  expect(child.exitCode).toBeNull();
  child.stdin.end();
  await ended(child);
}, 20_000);
