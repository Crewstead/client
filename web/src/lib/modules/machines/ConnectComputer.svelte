<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import { onMount } from 'svelte';
  import { Check, Cloud, Copy, Monitor } from '@lucide/svelte';
  import type { MachineView } from '@crewstead/core/protocol';
  import { serverUrl } from '#lib/auth/connection.ts';
  import { copyText } from '#lib/clipboard.ts';
  import { machines } from './api.ts';
  import HubSignIn from './HubSignIn.svelte';
  let { close }: { close: () => void } = $props();
  const id = $props.id();
  /** The desktop app, when this page is in it. */
  const app = (
    globalThis as {
      crewsteadDesktop?: {
        useComputer?: () => Promise<void>;
        thisComputer?: () => Promise<string | undefined>;
      };
    }
  ).crewsteadDesktop;
  let dialog = $state<HTMLDialogElement>();
  /** Where Claude Code runs: the hub's own service (docs/plan/30), or a computer. */
  let where = $state<'hub' | 'computer'>('computer');
  /** The hub's own Claude Code service, when this hub has one for its owner. */
  let hub = $state<MachineView>();
  let hubSignIn = $state<ReturnType<typeof HubSignIn>>();
  let code = $state('');
  let sent = $state(false);
  const hubSignedIn = $derived(!!hub?.claudeCode?.accounts?.[0]?.signedIn);
  /** This computer, when the app here is already connected to this hub. */
  let here = $state<MachineView>();
  /** A computer without the app (a server): connected with a command and a one-time token. */
  let manual = $state(false);
  let created = $state<{ machine: MachineView; token: string }>();
  let online = $state(false);
  let busy = $state(false);
  let error = $state('');
  let copied = $state('');
  const command = `npm run machine -- connect ${serverUrl()}`;
  async function copy(label: string, text: string) {
    await copyText(text);
    copied = label;
    setTimeout(() => (copied = ''), 1500);
  }
  async function findHub(first = false) {
    hub = (await machines.list().catch(() => [])).find((machine) => machine.hosted);
    if (first && hub) where = 'hub';
  }
  async function findHere() {
    const mine = await app?.thisComputer?.().catch(() => undefined);
    if (!mine) return;
    here = (await machines.list().catch(() => [])).find((machine) => machine.id === mine);
  }
  async function createToken() {
    busy = true;
    error = '';
    try {
      created = await machines.create('New computer');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not create a token';
    } finally {
      busy = false;
    }
  }
  /** A token that was never used is removed, so no unused access is left behind. */
  async function finish() {
    if (created && !online) await machines.remove(created.machine.id).catch(() => {});
    close();
  }
  onMount(() => {
    dialog?.showModal();
    void findHub(true);
    void findHere();
    const timer = setInterval(async () => {
      if (where === 'hub') await findHub();
      if (app?.thisComputer && !here) await findHere();
      if (!created || online) return;
      const found = (await machines.list().catch(() => [])).find(
        (machine) => machine.id === created!.machine.id,
      );
      if (found?.online) online = true;
    }, 2_000);
    return () => clearInterval(timer);
  });
</script>

<dialog
  {@attach closeOutside}
  bind:this={dialog}
  class="dialog-content wide-dialog"
  aria-labelledby={`${id}-title`}
  onclose={finish}
>
  <h2 id={`${id}-title`} class="dialog-title">Connect Claude Code</h2>
  <div class="place-choices" role="radiogroup" aria-label="Where Claude Code runs">
    <button
      type="button"
      class="place-choice"
      role="radio"
      aria-checked={where === 'hub'}
      disabled={!hub}
      onclick={() => (where = 'hub')}
      ><Cloud size={18} /><span
        ><strong>On the hub</strong><small
          >{hub ? 'Works when your computers are off' : 'Not set up on this hub'}</small
        ></span
      ></button
    >
    <button
      type="button"
      class="place-choice"
      role="radio"
      aria-checked={where === 'computer'}
      onclick={() => (where = 'computer')}
      ><Monitor size={18} /><span
        ><strong>On a computer</strong><small>Where Claude Code is signed in</small></span
      ></button
    >
  </div>
  <div class="place-steps">
    {#if where === 'hub' && hub}
      <HubSignIn bind:this={hubSignIn} machine={hub} bind:code bind:sent />
    {:else if here}
      <p role="status">
        {here.claudeCode
          ? `${here.name} is connected with Claude Code. Its models are in your list.`
          : `${here.name} is connected. Sign in to Claude Code there (run claude once) and its models appear.`}
      </p>
    {:else if manual}
      <ol class="connect-steps">
        <li>
          <span>In a Crewstead client checkout on that computer, run:</span>
          <span class="copy-line"
            ><code>{command}</code><button
              class="icon-button"
              aria-label="Copy command"
              onclick={() => copy('command', command)}
              >{#if copied === 'command'}<Check size={14} />{:else}<Copy size={14} />{/if}</button
            ></span
          >
        </li>
        <li>
          <span>When it asks, paste this token. It is shown only once.</span>
          {#if created}
            <span class="copy-line"
              ><code class="token">{created.token}</code><button
                class="icon-button"
                aria-label="Copy token"
                onclick={() => copy('token', created!.token)}
                >{#if copied === 'token'}<Check size={14} />{:else}<Copy size={14} />{/if}</button
              ></span
            >
          {:else}
            <button class="button subtle small" disabled={busy} onclick={createToken}
              >Show token</button
            >
          {/if}
        </li>
      </ol>
      {#if created}<p role="status">
          {online
            ? 'Connected. Its Claude Code models are in your list.'
            : 'Waiting for it to connect…'}
        </p>{/if}
    {:else if app?.useComputer}
      <p>The app asks before chats can use this computer.</p>
    {:else}
      <p>Open the Crewstead app on that computer; it offers to connect.</p>
    {/if}
  </div>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  <div class="dialog-actions">
    {#if where === 'hub' && hub}
      {#if hubSignedIn}
        <button class="button primary" onclick={() => dialog?.close()}>Done</button>
      {:else}
        <button class="button subtle" onclick={() => dialog?.close()}>Cancel</button>
        <button
          class="button primary"
          disabled={!code.trim() || sent}
          onclick={() => void hubSignIn?.connect()}>{sent ? 'Connecting…' : 'Connect'}</button
        >
      {/if}
    {:else}
      {#if !here && !app?.useComputer}
        <button type="button" class="link-button dialog-back" onclick={() => (manual = !manual)}
          >{manual ? 'Use the app instead' : 'A server without the app'}</button
        >
      {/if}
      {#if here || online}
        <button class="button primary" onclick={() => dialog?.close()}>Done</button>
      {:else}
        <button class="button subtle" onclick={() => dialog?.close()}>Cancel</button>
        {#if app?.useComputer}
          <button
            class="button primary"
            onclick={async () => {
              await app.useComputer?.();
              await findHere();
            }}>Use this computer</button
          >
        {:else if !manual}
          <a
            class="button primary"
            href="https://github.com/Crewstead/client/releases/latest"
            target="_blank"
            rel="noreferrer">Get the app</a
          >
        {/if}
      {/if}
    {/if}
  </div>
</dialog>
