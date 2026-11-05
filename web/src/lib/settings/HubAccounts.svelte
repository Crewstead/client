<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import { Check, Copy } from '@lucide/svelte';
  import { request } from '#lib/api.ts';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/account-settings.css';
  import '@crewstead/ui/hub-accounts.css';
  interface Account {
    id: string;
    login: string;
    owner: boolean;
    mustChangePassword?: boolean;
  }
  const id = $props.id();
  let accounts = $state<Account[]>([]);
  let login = $state('');
  let busy = $state(false);
  let error = $state('');
  /** A one-time password just made, shown until dismissed; it is never shown again. */
  let issued = $state<{ login: string; password: string; added: boolean }>();
  let copied = $state(false);
  let confirming = $state('');
  async function load() {
    try {
      accounts = await request<Account[]>('/hub/accounts');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load the accounts.';
    }
  }
  void load();
  async function act(work: () => Promise<void>) {
    busy = true;
    error = '';
    copied = false;
    try {
      await work();
      await load();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That did not work.';
    } finally {
      busy = false;
    }
  }
  const add = (event: SubmitEvent) => {
    event.preventDefault();
    return act(async () => {
      const result = await request<{ user: Account; temporaryPassword: string }>('/hub/accounts', {
        method: 'POST',
        body: JSON.stringify({ login: login.trim() }),
      });
      issued = { login: result.user.login, password: result.temporaryPassword, added: true };
      login = '';
    });
  };
  const reset = (account: Account) =>
    act(async () => {
      const result = await request<{ temporaryPassword: string }>(
        `/hub/accounts/${account.id}/reset`,
        { method: 'POST' },
      );
      issued = { login: account.login, password: result.temporaryPassword, added: false };
      confirming = '';
    });
  async function copy() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.password);
    copied = true;
  }
</script>

<section class="settings-section" aria-label="Hub accounts">
  <SettingsHeading title="Hub accounts">
    Everyone who can sign in to this hub. A new account gets a one-time password; its person chooses
    their own at the first sign-in.
  </SettingsHeading>
  {#if issued}
    <div class="settings-card issued-password" role="status">
      <p>
        {issued.added ? 'Added' : 'New password for'} <strong>{issued.login}</strong>. Give them
        this one-time password privately; it is shown only now.
      </p>
      <div class="issued-line">
        <code>{issued.password}</code>
        <button class="button subtle small" onclick={copy} aria-label="Copy password"
          >{#if copied}<Check size={14} />Copied{:else}<Copy size={14} />Copy{/if}</button
        >
        <button class="link-button" onclick={() => (issued = undefined)}>Done</button>
      </div>
    </div>
  {/if}
  <div class="settings-card">
    <ul aria-label="Accounts">
      {#each accounts as account (account.id)}
        <li>
          <span class="profile-avatar small" aria-hidden="true"
            >{account.login[0]?.toUpperCase()}</span
          >
          <span class="row-name"
            >{account.login}{#if account.owner}<small class="role-tag">Owner</small
              >{:else if account.mustChangePassword}<small class="muted-text"
                >Has not chosen a password yet</small
              >{/if}</span
          >
          {#if !account.owner}
            {#if confirming === account.id}
              <span class="muted-text">Sign them out with a new password?</span>
              <button
                class="button subtle small"
                disabled={busy}
                onclick={() => reset(account)}
                aria-label={`Confirm new password for ${account.login}`}>Yes, reset</button
              >
              <button class="link-button" onclick={() => (confirming = '')}>Cancel</button>
            {:else}
              <button
                class="button subtle small"
                disabled={busy}
                onclick={() => (confirming = account.id)}
                aria-label={`Reset password for ${account.login}`}>Reset password</button
              >
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
    <form class="card-footer inline-form" onsubmit={add} aria-label="Add account">
      <label for={`${id}-login`} class="sr-only">New account’s username</label>
      <input
        id={`${id}-login`}
        bind:value={login}
        required
        maxlength="64"
        autocapitalize="none"
        spellcheck="false"
        placeholder="New account’s username"
      />
      <button type="submit" class="button subtle small" disabled={busy || !login.trim()}
        >Add account</button
      >
    </form>
  </div>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
</section>
