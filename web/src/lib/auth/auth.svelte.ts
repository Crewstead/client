import { getContext } from 'svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { readAccounts, writeAccounts, sameAccount, type SavedAccount } from './saved-accounts.ts';
import {
  accountHeaders,
  apiUrl,
  normalizeServer,
  rememberedAccount,
  serverUrl,
  selectAccount,
  selectServer,
  setCsrf,
  csrfHeaders,
} from './connection.ts';
const session = (server: string, userId: string) =>
  fetch(apiUrl('/auth/session', server), {
    credentials: 'include',
    redirect: 'error',
    headers: accountHeaders(userId),
  });
interface User {
  id: string;
  login: string;
  /** The hub's owner asked this account for a new password; nothing else opens until then. */
  mustChangePassword?: boolean;
  /** The hub's owner (its first account), who manages the other accounts. */
  owner?: boolean;
}
interface Profile {
  user: User;
  csrf: string;
}
export class Authentication {
  user = $state<User | null>(null);
  ready = $state(false);
  server = $state('');
  error = $state('');
  accounts = $state<SavedAccount[]>([]);
  connecting = $state<{ account: SavedAccount; adding: boolean } | null>(null);
  get scope() {
    return `${this.server}:${this.user?.id ?? ''}`;
  }
  async initialize() {
    this.accounts = readAccounts();
    try {
      this.server = serverUrl();
      const response = await session(this.server, rememberedAccount());
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Could not connect to the server.');
      this.accept(await response.json());
    } catch {
      this.error = 'Could not connect. Check the server address and try again.';
    } finally {
      this.ready = true;
    }
  }
  private accept(profile: Profile) {
    if (!profile.user?.id || !profile.user.login || !/^[a-f0-9]{64}$/.test(profile.csrf))
      throw new Error('The server returned an invalid sign-in response.');
    selectAccount(profile.user.id);
    setCsrf(profile.csrf);
    this.user = profile.user;
    this.error = '';
    const account = { server: this.server, login: profile.user.login };
    this.accounts = [account, ...this.accounts.filter((row) => !sameAccount(row, account))];
    writeAccounts(this.accounts);
  }
  openAccount(account?: SavedAccount) {
    this.connecting = {
      account: account ?? { server: this.server || location.origin, login: '' },
      adding: !account,
    };
  }
  forgetAccount(account: SavedAccount) {
    this.accounts = this.accounts.filter((row) => !sameAccount(row, account));
    writeAccounts(this.accounts);
  }
  async signIn(server: string, login: string, password: string) {
    server = normalizeServer(server);
    const response = await fetch(apiUrl('/auth/login', server), {
      method: 'POST',
      credentials: 'include',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? 'Sign-in failed.');
    const check = await session(server, result.user.id);
    if (!check.ok)
      throw new Error(
        'The browser could not save the server session. Open the server directly to sign in.',
      );
    const profile = (await check.json()) as Profile;
    selectServer(server);
    this.server = server;
    this.accept(profile);
  }
  /**
   * Switches to a saved account that is still signed in on its server, without a password.
   * Returns false when that account needs signing in again.
   */
  async switchAccount(account: SavedAccount) {
    try {
      const server = normalizeServer(account.server);
      const listed = await fetch(apiUrl('/auth/accounts', server), {
        credentials: 'include',
        redirect: 'error',
      });
      const users = listed.ok ? ((await listed.json()) as User[]) : [];
      const user = users.find((row) => row.login === account.login);
      if (!user) return false;
      const check = await session(server, user.id);
      if (!check.ok) return false;
      const profile = (await check.json()) as Profile;
      selectServer(server);
      this.server = server;
      this.accept(profile);
      return true;
    } catch {
      return false;
    }
  }
  /** Opens a saved account: instantly when it is still signed in, otherwise via its password. */
  async chooseAccount(account: SavedAccount) {
    if (await this.switchAccount(account)) await goto(resolve('/'), { replace: true });
    else this.openAccount(account);
  }
  /** Replaces the account's password; it stays signed in here and is signed out everywhere else. */
  async changePassword(current: string, password: string) {
    const response = await fetch(apiUrl('/auth/password'), {
      method: 'POST',
      credentials: 'include',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders(), ...accountHeaders() },
      body: JSON.stringify({ current, password }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message ?? 'Could not change the password.');
    this.accept(result as Profile);
  }
  expire() {
    this.user = null;
    setCsrf('');
  }
  async signOut() {
    const response = await fetch(apiUrl('/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: { ...csrfHeaders(), ...accountHeaders() },
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Could not sign out. Check the connection and retry.');
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith('crewstead:draft:') || key.startsWith('new:') || key.startsWith('draft:'))
        sessionStorage.removeItem(key);
    this.expire();
  }
}
export const useAuthentication = () => getContext<Authentication>('authentication');
