import { normalizeServer } from './connection.ts';

export interface SavedAccount {
  server: string;
  login: string;
}
const key = 'crewstead-accounts';
export const sameAccount = (a: SavedAccount, b: SavedAccount) =>
  a.server === b.server && a.login === b.login;

// Connection hints only. Passwords, tokens and transcript data never belong here.
export function readAccounts(): SavedAccount[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return [];
    const accounts: SavedAccount[] = [];
    for (const row of value.slice(0, 50)) {
      if (!row || typeof row.server !== 'string' || typeof row.login !== 'string') continue;
      if (!/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(row.login)) continue;
      try {
        const account = { server: normalizeServer(row.server), login: row.login };
        if (!accounts.some((other) => sameAccount(account, other))) accounts.push(account);
      } catch {
        // Ignore invalid or obsolete connection hints without blocking sign-in.
      }
    }
    return accounts;
  } catch {
    return [];
  }
}
export function writeAccounts(accounts: SavedAccount[]) {
  try {
    localStorage.setItem(key, JSON.stringify(accounts.slice(0, 50)));
  } catch {
    // An unavailable browser store must not invalidate a successful server login.
  }
}
