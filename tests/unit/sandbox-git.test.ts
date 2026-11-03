import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCommand, sandboxAvailable } from '../../daemon/src/tools/command.ts';

let root: string;
const signal = new AbortController().signal;
const git = (...args: string[]) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
const run = (command: string, allowed: boolean) =>
  runCommand(root, { command }, signal, { git: allowed }).then((result) => result.output);

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'hub-git-')));
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Project Owner');
  git('config', 'user.email', 'owner@example.test');
  await rm(join(root, '.git/hooks'), { recursive: true, force: true });
  // A submodule's own Git folder, as `git submodule add` leaves it.
  await mkdir(join(root, '.git/modules/lib/hooks'), { recursive: true });
  await writeFile(join(root, '.git/modules/lib/HEAD'), 'ref: refs/heads/main\n');
  await writeFile(join(root, '.git/modules/lib/config'), '[core]\n');
  await writeFile(join(root, 'readme.md'), 'hello\n');
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe.skipIf(!sandboxAvailable() || spawnSync('git', ['--version']).status !== 0)(
  'Git in the sandbox',
  () => {
    it('cannot commit while the project does not allow Git', async () => {
      expect(await run('git add readme.md && git commit -qm first', false)).toMatch(
        /^Exit code: [1-9]/,
      );
      expect(git('log', '--oneline').status).not.toBe(0);
    });

    it('commits as the owner once it does', async () => {
      expect(
        await run('git add readme.md && git commit -qm first && git log --format=%an', true),
      ).toBe('Exit code: 0\nProject Owner');
      expect(git('log', '--format=%s %ae').stdout.trim()).toBe('first owner@example.test');
      expect(await run('git switch -qc feature && git branch --show-current', true)).toBe(
        'Exit code: 0\nfeature',
      );
    });

    it('keeps hooks and config as the owner left them', async () => {
      // There was no hooks folder: it is made, empty and read-only, so none can be put there.
      expect(existsSync(join(root, '.git/hooks'))).toBe(true);
      expect(await run('echo "touch owned" > .git/hooks/pre-commit', true)).toMatch(/Read-only/);
      expect(await run('git config core.fsmonitor "touch owned"', true)).toMatch(
        /^Exit code: [1-9]/,
      );
      expect(await run('echo x >> .git/modules/lib/config', true)).toMatch(/Read-only/);
      expect(await run('echo x > .git/modules/lib/hooks/post-checkout', true)).toMatch(/Read-only/);
      expect(git('config', '--get', 'core.fsmonitor').stdout).toBe('');
    });
  },
);
