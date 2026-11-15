import { existsSync } from 'node:fs';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  accountEnvironment,
  accountFor,
  accountStatuses,
  claudeAccountAction,
  claudeAccounts,
} from '../../daemon/src/claude-accounts.ts';
import { writeConfig } from '../../daemon/src/config.ts';

// A stand-in for `claude auth …`: a folder is signed in once `login` marked it; the usual folder
// (no CLAUDE_CONFIG_DIR) always is. No real Claude Code or sign-in is involved.
const FAKE = `#!/bin/sh
dir="\${CLAUDE_CONFIG_DIR:-usual}"
case "$2" in
  status)
    if [ "$dir" = usual ] || [ -f "$dir/signed" ]; then
      echo '{"loggedIn":true,"email":"me@example.test","subscriptionType":"max"}'
    else echo '{"loggedIn":false}'; exit 1; fi ;;
  login) touch "$dir/signed" ;;
  logout) rm -f "$dir/signed" ;;
esac
`;

describe.skipIf(process.platform === 'win32')('Claude Code accounts on a computer', () => {
  let home: string;
  let claude: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'crewstead-accounts-'));
    claude = join(home, 'fake-claude');
    await writeFile(claude, FAKE);
    await chmod(claude, 0o755);
    writeConfig(home, { hub: 'https://hub.test', token: 'test-token' });
  });
  afterEach(() => rm(home, { recursive: true, force: true }));

  it('starts with no account and never takes the computer’s own sign-in', async () => {
    expect(claudeAccounts(home)).toEqual([]);
    expect(await accountStatuses(claude, home)).toEqual([]);
    await expect(
      claudeAccountAction(
        claude,
        home,
        { kind: 'claude_add', name: 'This computer', mode: 'usual' },
        vi.fn(),
      ),
    ).rejects.toThrow(/for Crewstead instead/);
    expect(claudeAccounts(home)).toEqual([]);
  });

  it('on the hub’s own service, its one sign-in is added, and removing it signs it out', async () => {
    vi.stubEnv('CREWSTEAD_HOSTED', '1');
    try {
      await claudeAccountAction(
        claude,
        home,
        { kind: 'claude_add', name: 'Hub', mode: 'usual' },
        vi.fn(),
      );
      expect(claudeAccounts(home)).toEqual([{ id: 'default', name: 'Hub', folder: null }]);
      expect(accountEnvironment(accountFor(home, undefined)).CLAUDE_CONFIG_DIR).toBeUndefined();
      await expect(
        claudeAccountAction(
          claude,
          home,
          { kind: 'claude_add', name: 'again', mode: 'usual' },
          vi.fn(),
        ),
      ).rejects.toThrow(/already added/);
      await claudeAccountAction(
        claude,
        home,
        { kind: 'claude_remove', account: 'default' },
        vi.fn(),
      );
      expect(claudeAccounts(home)).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('adds Crewstead’s own account in its own folder, signs it in, renames and removes it', async () => {
    const changed = vi.fn();
    await claudeAccountAction(
      claude,
      home,
      { kind: 'claude_add', name: 'work', mode: 'new' },
      changed,
    );
    const work = claudeAccounts(home).find((account) => account.name === 'work')!;
    expect(work.folder).toBe(join(home, 'claude-accounts', work.id));
    expect(accountEnvironment(work).CLAUDE_CONFIG_DIR).toBe(work.folder);
    // The sign-in runs on its own; when it ends the hub is told again.
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    const statuses = await accountStatuses(claude, home);
    expect(statuses.find((account) => account.id === work.id)).toMatchObject({
      signedIn: true,
      usual: false,
      signingIn: false,
    });

    await claudeAccountAction(
      claude,
      home,
      { kind: 'claude_rename', account: work.id, name: 'company' },
      changed,
    );
    expect(accountFor(home, work.id)?.name).toBe('company');

    // Removing it signs out only its own folder and deletes it; the terminal's sign-in is untouched.
    await claudeAccountAction(claude, home, { kind: 'claude_remove', account: work.id }, changed);
    expect(existsSync(work.folder!)).toBe(false);
    expect(() => accountFor(home, work.id)).toThrow(/no longer on this computer/);
  });
});
