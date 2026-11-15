<script lang="ts">
  import type { ClaudeAccount, MachineView } from '@crewstead/core/protocol';
  import RowMenu, { type MenuItem } from '#lib/components/RowMenu.svelte';
  import { claudeAccounts } from './api.ts';
  let {
    machine,
    account,
    rename,
    act,
  }: {
    machine: MachineView;
    account: ClaudeAccount;
    rename: () => void;
    /** Runs a change, then reloads the list (showing any error). */
    act: (action: () => Promise<unknown>) => Promise<void>;
  } = $props();
  const models = $derived(machine.claudeCode?.models.map((model) => model.label).join(', ') ?? '');
  // The hub's own Claude Code has no browser: its sign-in page opens here, and its code is pasted here.
  let code = $state('');
  let sending = $state(false);
  async function sendCode() {
    if (!code.trim()) return;
    sending = true;
    await act(() => claudeAccounts.code(machine.id, account.id, code.trim()));
    code = '';
    sending = false;
  }
  const detail = $derived(
    account.signingIn
      ? machine.hosted
        ? 'Signing in'
        : `Waiting for the sign-in in the browser on ${machine.name}`
      : account.signedIn
        ? [account.email, account.plan && `${account.plan} plan`, models]
            .filter(Boolean)
            .join(' · ')
        : 'Not signed in: its models are not offered',
  );
  const items: MenuItem[] = $derived([
    {
      label: account.signedIn ? 'Sign in again' : 'Sign in',
      disabled: account.signingIn,
      run: () => act(() => claudeAccounts.login(machine.id, account.id)),
    },
    { label: 'Rename', run: rename },
    {
      label: 'Remove',
      confirm: account.usual ? 'Remove? Claude Code stays signed in' : 'Remove and sign out?',
      run: () => act(() => claudeAccounts.remove(machine.id, account.id)),
    },
  ]);
</script>

<li class="claude-account" data-signed-in={account.signedIn}>
  <span class="project-text">
    <span class="row-name">{account.name}</span>
    <span class="project-path" title={detail}
      >{#if account.signingIn}<span class="status-dot warning"
        ></span>{:else if !account.signedIn}<span class="status-dot failed"
        ></span>{/if}{detail}</span
    >
  </span>
  <RowMenu label={`Settings for ${account.name}`} title={account.name} {items} />
  {#if machine.hosted && account.signingIn}
    <form
      class="claude-account-code"
      onsubmit={(event) => {
        event.preventDefault();
        void sendCode();
      }}
    >
      {#if account.signInLink}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Anthropic's page -->
        <a href={account.signInLink} class="button subtle small" target="_blank" rel="noreferrer"
          >Open Claude sign-in</a
        >
      {:else}<span class="button subtle small" aria-disabled="true">Preparing the sign-in…</span
        >{/if}
      <input
        bind:value={code}
        aria-label="Code from Claude"
        placeholder="Paste the code from Claude"
        autocomplete="off"
        spellcheck="false"
        disabled={!account.signInLink || sending}
      />
      <button class="button small" disabled={!code.trim() || sending}>Connect</button>
    </form>
  {/if}
</li>
