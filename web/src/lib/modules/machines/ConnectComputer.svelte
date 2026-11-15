<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import { onMount } from 'svelte';
  import { Check, Copy } from '@lucide/svelte';
  import type { MachineView } from '@crewstead/core/protocol';
  import { serverUrl } from '#lib/auth/connection.ts';
  import { copyText } from '#lib/clipboard.ts';
  import { machines } from './api.ts';
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
  /** This computer, when the app here is already connected to this hub. */
  let here = $state<MachineView>();
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
    void findHere();
    const timer = setInterval(async () => {
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
  {#if here}
    <p class="dialog-description" role="status">
      {here.claudeCode
        ? `This computer (${here.name}) is connected, with Claude Code. Its models are in your list.`
        : `This computer (${here.name}) is connected. Sign in to Claude Code here (run claude once) and its models appear.`}
    </p>
  {:else if app?.useComputer}
    <p class="dialog-description">Use Claude Code signed in on this computer.</p>
    <button class="button primary" onclick={() => void app.useComputer?.()}
      >Use this computer</button
    >
  {:else}
    <p class="dialog-description">
      Open the Crewstead app on the computer where Claude Code is signed in; it offers to connect.
    </p>
    <a
      class="button subtle"
      href="https://github.com/Crewstead/client/releases/latest"
      target="_blank"
      rel="noreferrer">Get the app</a
    >
  {/if}
  {#if !here}
    <details class="connect-manual">
      <summary>Without the app</summary>
      <ol class="connect-steps">
        <li>
          <span>On that computer, in a Crewstead client checkout, run:</span>
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
      {#if created}
        <p class="form-note" role="status">
          {online
            ? 'Connected. Its Claude Code models are in your list.'
            : 'Waiting for it to connect…'}
        </p>
      {/if}
    </details>
  {/if}
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  <div class="dialog-actions">
    <button class="button primary" onclick={() => dialog?.close()}
      >{here || online ? 'Done' : 'Close'}</button
    >
  </div>
</dialog>
