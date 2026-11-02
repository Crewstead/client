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
  const detail = $derived(
    account.signingIn
      ? `Waiting for the sign-in in the browser on ${machine.name}`
      : account.signedIn
        ? [account.email, account.plan && `${account.plan} plan`, models]
            .filter(Boolean)
            .join(' · ')
        : 'Not signed in: its models are not offered',
  );
  const items: MenuItem[] = $derived([
    {
      label: account.signedIn ? 'Sign in again' : 'Sign in',
      hint: `Opens the sign-in page in the browser on ${machine.name}`,
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
</li>
