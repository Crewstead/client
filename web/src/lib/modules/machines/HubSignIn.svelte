<script lang="ts">
  import { onMount } from 'svelte';
  import type { MachineView } from '@crewstead/core/protocol';
  import { claudeAccounts } from './api.ts';
  let {
    machine,
    code = $bindable(''),
    sent = $bindable(false),
  }: {
    /** The hub's own Claude Code service, as last listed (the dialog lists it again every 2 s). */
    machine: MachineView;
    /** The code Anthropic's page shows; the dialog's Connect sends it. */
    code?: string;
    /** A code was sent and Claude Code is checking it. */
    sent?: boolean;
  } = $props();
  let error = $state('');
  const account = $derived(machine.claudeCode?.accounts?.[0]);
  /** Starts Claude Code's sign-in on the hub, which prints Anthropic's page for the owner. */
  async function start() {
    if (!account) return;
    error = '';
    sent = false;
    await claudeAccounts.login(machine.id, account.id).catch((cause: unknown) => {
      error = cause instanceof Error ? cause.message : 'Could not start the sign-in.';
    });
  }
  /** Sends the pasted code to the waiting sign-in; Connect calls it. */
  export async function connect() {
    if (!account || !code.trim()) return;
    error = '';
    try {
      await claudeAccounts.code(machine.id, account.id, code.trim());
      code = '';
      sent = true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not send the code.';
    }
  }
  // A sign-in that ended without signing in: that code did not work.
  $effect(() => {
    if (sent && account && !account.signingIn && !account.signedIn) {
      sent = false;
      error = 'That code did not work. Open the sign-in again and paste the new code.';
    }
  });
  onMount(() => {
    if (account && !account.signedIn && !account.signingIn) void start();
  });
</script>

{#if !machine.online}
  <p>The hub’s Claude Code is starting. Try again in a minute.</p>
{:else if account?.signedIn}
  <p role="status">
    Signed in{account.email ? ` as ${account.email}` : ''}{account.plan
      ? ` · ${account.plan} plan`
      : ''}. Its models are in your list.
  </p>
{:else}
  <ol class="connect-steps">
    <li>
      <span>Sign in with your Claude account.</span>
      {#if account?.signInLink}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Anthropic's page -->
        <a href={account.signInLink} class="button subtle small" target="_blank" rel="noreferrer"
          >Open Claude sign-in</a
        >{:else if account?.signingIn}<span class="button subtle small" aria-disabled="true"
          >Preparing the sign-in…</span
        >{:else}<button class="button subtle small" onclick={start}>Start the sign-in</button>{/if}
    </li>
    <li>
      <label for="hub-claude-code">Paste the code from Claude</label>
      <input
        id="hub-claude-code"
        bind:value={code}
        autocomplete="off"
        spellcheck="false"
        disabled={sent || !account?.signInLink}
      />
    </li>
  </ol>
  {#if sent}<p role="status">Checking the code…</p>{/if}
{/if}
{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
