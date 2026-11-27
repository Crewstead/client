import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCommand } from '../../daemon/src/tools/command.ts';
import { ownerSid, sandboxProgram } from '../../daemon/src/tools/sandbox-windows.ts';

// The Windows sandbox on a real Windows machine (CI's Windows job builds crewstead-sandbox.exe first).
// What it promises: commands write only in their project and never in Git metadata; as a sandbox
// user they also cannot read the owner's files or reach the network unless it was asked for.
const program = process.platform === 'win32' ? sandboxProgram() : undefined;
const admin = !!program && spawnSync('net', ['session'], { stdio: 'ignore' }).status === 0;

let root: string;
let project: string;
let home: string;
beforeAll(async () => {
  if (!program) return;
  // Each step of the sandbox in the output, so a failure here shows where it stopped.
  process.env.CREWSTEAD_SANDBOX_TRACE = '1';
  root = await mkdtemp(join(tmpdir(), 'crewstead-sandbox-'));
  project = join(root, 'project');
  home = join(root, 'settings');
  await mkdir(join(project, '.git'), { recursive: true });
  await mkdir(home);
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 1_000 });
});

// A time limit under the test's own, so a command that hangs still shows its output.
const run = (command: string, windows: 'restricted' | 'users', network = false) =>
  runCommand(project, { command, network, timeout_seconds: 50 }, new AbortController().signal, {
    windows,
    home,
  });

describe.skipIf(!program)('the Windows sandbox', () => {
  it('without its users, writes only in the project, never in .git, and keeps the exit code', async () => {
    const outside = join(root, 'outside.txt');
    const result = await run(
      `Set-Content inside.txt ok; ` +
        `try { Set-Content '${outside}' bad -ErrorAction Stop } catch { 'outside: denied' }; ` +
        `try { Set-Content .git\\HEAD bad -ErrorAction Stop } catch { 'git: denied' }; exit 3`,
      'restricted',
    );
    expect(result.output).toContain('Exit code: 3');
    expect(result.output).toContain('outside: denied');
    expect(result.output).toContain('git: denied');
    expect(existsSync(join(project, 'inside.txt'))).toBe(true);
    expect(existsSync(outside)).toBe(false);
  });

  // Setup creates Windows users and firewall rules, so only where the test runs as an administrator
  // (CI's Windows machine), and it removes them again.
  describe.skipIf(!admin)('as a sandbox user', () => {
    const secret = join(homedir(), `crewstead-sandbox-test-${process.pid}.txt`);
    beforeAll(async () => {
      await writeFile(secret, 'private');
      const setup = spawnSync(program!, ['setup', '--home', home, '--owner', ownerSid()], {
        encoding: 'utf8',
      });
      expect(setup.status, setup.stderr).toBe(0);
    }, 120_000);
    afterAll(async () => {
      await rm(secret, { force: true });
      if (program) spawnSync(program, ['remove', '--home', home]);
    }, 120_000);

    it('writes in the project but cannot read the owner’s files', async () => {
      const result = await run(
        `[Environment]::UserName; 'cwd: ' + [Environment]::CurrentDirectory; 'pwd: ' + $PWD.Path; ` +
          `try { Set-Content user.txt ok -ErrorAction Stop } catch { 'write: ' + $_ }; ` +
          `try { Get-Content '${secret}' -ErrorAction Stop } catch { 'secret: denied' }`,
        'users',
      );
      expect(result.output).toContain('Exit code: 0');
      expect(result.output).toContain('CrewsteadSbxOffline');
      expect(result.output).toContain('secret: denied');
      expect(result.output).not.toContain('private');
      // On failure: who the command ran as, and the folder's permissions.
      const groups = (await run('whoami /groups', 'users')).output;
      const acl = spawnSync('icacls', [project], { encoding: 'utf8' }).stdout;
      expect(existsSync(join(project, 'user.txt')), `${result.output}\n${groups}\n${acl}`).toBe(
        true,
      );
    }, 120_000);

    it('has no network unless it was asked for', async () => {
      // curl.exe, which comes with Windows, over plain HTTP: what is tested is the network, not TLS.
      const probe =
        `$out = curl.exe -sS -m 15 -I http://example.com 2>&1; ` +
        `if ($LASTEXITCODE -eq 0) { 'network: reached' } ` +
        `else { 'network: blocked (' + $LASTEXITCODE + ') ' + ($out -join ' ') }; ` +
        `$tls = curl.exe -sS -m 15 -I https://example.com 2>&1; 'https: ' + $LASTEXITCODE + ' ' + ($tls -join ' ')`;
      expect((await run(probe, 'users')).output).toContain('network: blocked');
      const online = (await run(probe, 'users', true)).output;
      expect(online).toContain('network: reached');
      // HTTPS too (Windows' own TLS, which npm, pip and Git also use there).
      expect(online).toContain('https: 0 ');
    }, 180_000);
  });
});
