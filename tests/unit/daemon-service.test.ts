import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { launcher, STOPPED_FOR_GOOD, unit } from '../../daemon/src/service.ts';

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

it('installs a launcher that runs the daemon from any folder', async () => {
  root = await mkdtemp(join(tmpdir(), 'hub-launcher-'));
  const command = join(root, 'crewstead');
  await writeFile(command, launcher());
  await chmod(command, 0o755);
  // From an unrelated folder, with this test's settings folder, it shows its status.
  const output = execFileSync(command, ['status'], {
    cwd: root,
    env: { ...process.env, HUB_MACHINE_HOME: join(root, 'machine') },
  }).toString();
  expect(output).toContain('Hub:       not connected');
  expect(output).toContain('Allowed:   none');
  const unknown = spawnSync(command, ['nope'], { cwd: root });
  expect(unknown.status).toBe(1);
  expect(unknown.stderr.toString()).toContain('Unknown command: nope');
  // Running without a connection stops for good, so the service does not restart it in a loop.
  const run = spawnSync(command, ['run'], {
    cwd: root,
    env: { ...process.env, HUB_MACHINE_HOME: join(root, 'machine') },
  });
  expect(run.status).toBe(STOPPED_FOR_GOOD);
  // Three real starts of the command; slow while other tests run browsers at the same time.
}, 20_000);

it('describes a user service that keeps the install’s PATH and stops when removed', () => {
  const text = unit(
    '/home/me/.local/bin/crewstead',
    '/home/me/.config/crewstead-machine',
    '/home/me/.nvm/bin:/usr/bin:/odd%dir',
  );
  expect(text).toContain('Environment=HUB_MACHINE_HOME=/home/me/.config/crewstead-machine');
  expect(text).toContain('ExecStart=/home/me/.local/bin/crewstead run');
  expect(text).toContain('Environment=PATH=/home/me/.nvm/bin:/usr/bin:/odd%%dir');
  expect(text).toContain('Restart=on-failure');
  expect(text).toContain(`RestartPreventExitStatus=${STOPPED_FOR_GOOD}`);
  expect(text).toContain('WantedBy=default.target');
});
