import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { projectRoot } from '../../daemon/src/projects.ts';
import { runCommand, sandboxAvailable } from '../../daemon/src/tools/command.ts';
import { unifiedDiff } from '@crewstead/core/policy';
import {
  editProjectFile,
  listFiles,
  readProjectFile,
  writeProjectFile,
} from '../../daemon/src/tools/files.ts';
import { projectPath } from '../../daemon/src/tools/paths.ts';
import { searchProject } from '../../daemon/src/tools/search.ts';

let root: string;
let outside: string;
const signal = new AbortController().signal;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'hub-project-')));
  outside = await realpath(await mkdtemp(join(tmpdir(), 'hub-outside-')));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, '.git'));
  await mkdir(join(root, 'node_modules/pkg'), { recursive: true });
  await writeFile(join(root, 'src/app.ts'), 'const a = 1;\nconst b = 2;\nexport { a, b };\n');
  await writeFile(join(root, '.git/HEAD'), 'ref: refs/heads/main\n');
  await writeFile(join(outside, 'secret.txt'), 'top secret\n');
  await symlink(outside, join(root, 'escape'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('project folders', () => {
  it('refuses system, home and private folders as projects', () => {
    expect(() => projectRoot('/')).toThrow(/System folders/);
    expect(() => projectRoot('/etc')).toThrow(/System folders/);
    expect(() => projectRoot(homedir())).toThrow(/home folder/);
    expect(() => projectRoot(join(root, 'nope'))).toThrow(/No such folder/);
    expect(projectRoot(root)).toBe(root);
  });

  it('keeps every path inside the project, through links too', async () => {
    await expect(projectPath(root, '../x')).rejects.toThrow(/outside the project/);
    await expect(projectPath(root, '/etc/passwd')).rejects.toThrow(/relative/);
    await expect(projectPath(root, 'escape/secret.txt')).rejects.toThrow(/leads outside/);
    await expect(projectPath(root, 'escape/new.txt', { write: true })).rejects.toThrow(
      /leads outside/,
    );
    await expect(projectPath(root, '.git/config', { write: true })).rejects.toThrow(/Git metadata/);
    expect((await projectPath(root, 'src/new/deep.ts', { write: true })).shown).toBe(
      'src/new/deep.ts',
    );
  });
});

describe('file tools', () => {
  it('lists without descending into .git or node_modules', async () => {
    const { output } = await listFiles(root, { depth: 3 });
    expect(output.split('\n')).toEqual(
      expect.arrayContaining(['.git/', 'node_modules/', 'src/', 'src/app.ts']),
    );
    expect(output).not.toContain('HEAD');
    expect(output).not.toContain('node_modules/pkg');
  });

  it('reads with line numbers and pages long files', async () => {
    expect((await readProjectFile(root, { path: 'src/app.ts' })).output).toContain(
      '     2  const b = 2;',
    );
    const page = await readProjectFile(root, { path: 'src/app.ts', offset: 2, limit: 1 });
    expect(page.output).toBe('     2  const b = 2;\n… 1 more line; read on from 3.');
  });

  it('previews an edit as a diff without changing the file, then applies it', async () => {
    const args = { path: 'src/app.ts', old_text: 'const b = 2;', new_text: 'const b = 3;' };
    const preview = await editProjectFile(root, args, false);
    expect(preview.diff).toContain('-const b = 2;\n+const b = 3;');
    expect(await readFile(join(root, 'src/app.ts'), 'utf8')).toContain('const b = 2;');
    expect((await editProjectFile(root, args, true)).output).toBe('Edited src/app.ts (+1 −1).');
    expect(await readFile(join(root, 'src/app.ts'), 'utf8')).toContain('const b = 3;');
  });

  it('refuses edits that are missing or ambiguous', async () => {
    await expect(
      editProjectFile(root, { path: 'src/app.ts', old_text: 'nope', new_text: 'x' }, true),
    ).rejects.toThrow(/not found/);
    await expect(
      editProjectFile(root, { path: 'src/app.ts', old_text: 'const', new_text: 'let' }, true),
    ).rejects.toThrow(/appears 2 times/);
  });

  it('creates files in new folders but never writes Git metadata', async () => {
    const created = await writeProjectFile(root, { path: 'docs/a.md', content: '# A\n' }, true);
    expect(created.output).toBe('Created docs/a.md (+1 −0).');
    expect(created.diff).toContain('--- /dev/null');
    await expect(writeProjectFile(root, { path: '.git/HEAD', content: 'x' }, true)).rejects.toThrow(
      /Git metadata/,
    );
  });

  it('searches with ripgrep', async () => {
    const { output } = await searchProject(root, { pattern: 'const [ab]' }, signal);
    expect(output.split('\n').sort()).toEqual([
      'src/app.ts:1:const a = 1;',
      'src/app.ts:2:const b = 3;',
    ]);
    expect((await searchProject(root, { pattern: 'zzz' }, signal)).output).toBe('No matches.');
  });

  it('diffs like git, with context and separate hunks', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    const after = before.replace('line 2\n', 'line two\n').replace('line 18\n', '');
    expect(unifiedDiff('f.txt', before, after)).toBe(
      '--- a/f.txt\n+++ b/f.txt\n' +
        '@@ -1,5 +1,5 @@\n line 1\n-line 2\n+line two\n line 3\n line 4\n line 5\n' +
        '@@ -15,6 +15,5 @@\n line 15\n line 16\n line 17\n-line 18\n line 19\n line 20\n',
    );
  });
});

describe.skipIf(!sandboxAvailable())('commands in the sandbox', () => {
  const run = (command: string, extra: { network?: boolean; timeout_seconds?: number } = {}) =>
    runCommand(root, { command, ...extra }, signal).then((result) => result.output);

  it('runs in the project folder and can change files there', async () => {
    expect(await run('pwd && echo made > made.txt && cat made.txt')).toBe(
      `Exit code: 0\n${root}\nmade`,
    );
  });

  it('cannot change Git metadata, other folders or reach the network', async () => {
    expect(await run('echo x > .git/HEAD')).toMatch(/^Exit code: [1-9][\s\S]*Read-only/);
    // Other folders are read-only, and this one, in /tmp, is not there at all: /tmp is private.
    expect(await run(`echo x > ${outside}/new.txt`)).toMatch(/^Exit code: 1/);
    expect(await run('cat escape/secret.txt')).not.toContain('top secret');
    expect(await run('echo x > /etc/crewstead-test')).toMatch(/Read-only/);
    const connect = `node -e "require('net').connect(80, '1.1.1.1').on('connect', () => { console.log('online'); process.exit() }).on('error', () => { console.log('offline'); process.exit() })"`;
    expect(await run(connect)).toBe('Exit code: 0\noffline');
  });

  it('cannot reach sockets that start programs outside it', async () => {
    expect(await run('ls -A /run | wc -l')).toBe('Exit code: 0\n0');
    expect(await run('test -e /var/run/docker.sock && echo visible || echo hidden')).toBe(
      'Exit code: 0\nhidden',
    );
  });

  it('hides private folders such as ~/.ssh', async () => {
    expect(await run('ls -A ~/.ssh 2>/dev/null | wc -l')).toBe('Exit code: 0\n0');
  });

  it('reports output while the command runs', async () => {
    const seen: string[] = [];
    await runCommand(
      root,
      { command: 'echo first; sleep 0.3; echo second' },
      signal,
      {},
      (output) => seen.push(output),
    );
    expect(seen[0]).toBe('first\n');
    expect(seen.at(-1)).toBe('first\nsecond\n');
  });

  it('stops the command at once when the reply is stopped', async () => {
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(new Error('Stopped.')), 300);
    await expect(
      runCommand(root, { command: 'sleep 30; echo late > late.txt' }, controller.signal),
    ).rejects.toThrow('Stopped.');
    expect(Date.now() - started).toBeLessThan(3_000);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(readFile(join(root, 'late.txt'), 'utf8')).rejects.toThrow();
  });

  it('stops at the time limit and reports the exit code', async () => {
    expect(await run('exit 3')).toBe('Exit code: 3\n(no output)');
    expect(await run('sleep 5', { timeout_seconds: 1 })).toMatch(/^Stopped after 1 s/);
  });
});
