import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { claudeEnvironment } from '@crewstead/core/adapter-claude-code';
import {
  DEFAULT_CLAUDE_ACCOUNT,
  type ClaudeAccount,
  type ClaudeAccountAction,
} from '@crewstead/core/protocol';
import { readConfig, writeConfig } from './config.ts';

/** A Claude Code account here: a name and its configuration folder (null: the usual `~/.claude`). */
export interface StoredClaudeAccount {
  id: string;
  name: string;
  folder: string | null;
}

const LOGIN_MS = 10 * 60_000;
const MAX_ACCOUNTS = 10;
/** Sign-ins waiting in this computer's browser, by account id. */
const signingIn = new Map<string, ChildProcess>();

/** Until its owner changes them, a computer has its usual sign-in, as before accounts existed. */
export function claudeAccounts(home: string): StoredClaudeAccount[] {
  return (
    readConfig(home)?.claudeAccounts ?? [
      { id: DEFAULT_CLAUDE_ACCOUNT, name: 'This computer', folder: null },
    ]
  );
}

/** Claude Code's environment for one account: its folder, or the usual one. */
export function accountEnvironment(account: StoredClaudeAccount | undefined) {
  const env = claudeEnvironment(process.env);
  delete env.CLAUDE_CONFIG_DIR;
  if (account?.folder) env.CLAUDE_CONFIG_DIR = account.folder;
  return env;
}

/** The account a run asked for; the usual one when none was named. */
export function accountFor(home: string, id: string | undefined) {
  const list = claudeAccounts(home);
  const account = list.find((entry) => entry.id === (id ?? DEFAULT_CLAUDE_ACCOUNT));
  // A removed account, the usual one included, is not used again.
  if (!account) throw new Error('That Claude Code account is no longer on this computer.');
  return account;
}

/** What `claude auth status` says. Only its answer is read, never the sign-in itself. */
async function status(binary: string, account: StoredClaudeAccount): Promise<ClaudeAccount> {
  const base = {
    id: account.id,
    name: account.name,
    usual: account.folder === null,
    signedIn: false,
    signingIn: signingIn.has(account.id),
  };
  try {
    const { stdout } = await promisify(execFile)(binary, ['auth', 'status', '--json'], {
      timeout: 15_000,
      env: accountEnvironment(account),
    }).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? '' }));
    const answer = JSON.parse(stdout) as {
      loggedIn?: boolean;
      email?: string;
      subscriptionType?: string;
    };
    return {
      ...base,
      signedIn: answer.loggedIn === true,
      ...(answer.loggedIn && answer.email ? { email: answer.email.slice(0, 200) } : {}),
      ...(answer.loggedIn && answer.subscriptionType
        ? { plan: answer.subscriptionType.slice(0, 40) }
        : {}),
    };
  } catch {
    return base;
  }
}

export const accountStatuses = (binary: string, home: string) =>
  Promise.all(claudeAccounts(home).map((account) => status(binary, account)));

function save(home: string, accounts: StoredClaudeAccount[]) {
  const config = readConfig(home);
  if (!config) throw new Error('Not set up yet. Run: crewstead connect <hub address>');
  writeConfig(home, { ...config, claudeAccounts: accounts });
}

/**
 * Starts Claude Code's own sign-in for an account: it opens Anthropic's page in this computer's
 * browser and saves the sign-in in the account's folder. `changed` runs when it starts and ends.
 */
function login(binary: string, account: StoredClaudeAccount, changed: () => void) {
  signingIn.get(account.id)?.kill();
  const child = spawn(binary, ['auth', 'login', '--claudeai'], {
    env: accountEnvironment(account),
    // Standard input stays open: Claude Code waits for the browser rather than for typing.
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  child.stdin?.on('error', () => {});
  signingIn.set(account.id, child);
  const timer = setTimeout(() => child.kill(), LOGIN_MS);
  const done = () => {
    clearTimeout(timer);
    if (signingIn.get(account.id) === child) signingIn.delete(account.id);
    changed();
  };
  child.once('error', done);
  child.once('exit', done);
}

const newId = (list: StoredClaudeAccount[]) => {
  for (;;) {
    const id = `account-${randomBytes(3).toString('hex')}`;
    if (!list.some((entry) => entry.id === id)) return id;
  }
};

/** Adds, signs in, renames or removes an account, at the hub's request. */
export async function claudeAccountAction(
  binary: string,
  home: string,
  action: ClaudeAccountAction,
  changed: () => void,
) {
  const list = claudeAccounts(home);
  const find = (id: string) => {
    const account = list.find((entry) => entry.id === id);
    if (!account) throw new Error('That Claude Code account is no longer on this computer.');
    return account;
  };
  if (action.kind === 'claude_add') {
    if (list.length >= MAX_ACCOUNTS) throw new Error(`At most ${MAX_ACCOUNTS} accounts.`);
    if (action.mode === 'usual') {
      if (list.some((entry) => entry.folder === null))
        throw new Error('This computer’s usual sign-in is already added.');
      const id = list.some((entry) => entry.id === DEFAULT_CLAUDE_ACCOUNT)
        ? newId(list)
        : DEFAULT_CLAUDE_ACCOUNT;
      save(home, [...list, { id, name: action.name, folder: null }]);
      return;
    }
    const id = newId(list);
    const folder = join(home, 'claude-accounts', id);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const account = { id, name: action.name, folder };
    save(home, [...list, account]);
    login(binary, account, changed);
  } else if (action.kind === 'claude_login') login(binary, find(action.account), changed);
  else if (action.kind === 'claude_rename')
    save(
      home,
      list.map((entry) => (entry.id === action.account ? { ...entry, name: action.name } : entry)),
    );
  else {
    const account = find(action.account);
    signingIn.get(account.id)?.kill();
    save(
      home,
      list.filter((entry) => entry.id !== account.id),
    );
    // A folder Crewstead made is signed out and deleted; the usual sign-in is only forgotten.
    if (account.folder) {
      await promisify(execFile)(binary, ['auth', 'logout'], {
        timeout: 15_000,
        env: accountEnvironment(account),
      }).catch(() => undefined);
      rmSync(account.folder, { recursive: true, force: true });
    }
  }
}
