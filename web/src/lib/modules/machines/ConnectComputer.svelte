<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Copy } from '@lucide/svelte';
  import type { MachineView } from '@crewstead/core/protocol';
  import { serverUrl } from '#lib/auth/connection.ts';
  import { copyText } from '#lib/clipboard.ts';
  import { machines } from './api.ts';
  let { close }: { close: () => void } = $props();
  const id = $props.id();
  let dialog = $state<HTMLDialogElement>();
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
    const timer = setInterval(async () => {
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
  bind:this={dialog}
  class="dialog-content wide-dialog"
  aria-labelledby={`${id}-title`}
  onclose={finish}
>
  <h2 id={`${id}-title`} class="dialog-title">Connect Claude Code</h2>
  <p class="dialog-description">
    Start Crewstead on the computer where Claude Code is installed and signed in. It connects to
    this hub, then keeps running in the background and starts with that computer; afterwards
    <code>crewstead status</code> shows how it is doing there.
  </p>
  <ol class="connect-steps">
    <li>
      <span>On that computer, in the Crewstead folder, run:</span>
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
        <button class="button subtle small" disabled={busy} onclick={createToken}>Show token</button
        >
      {/if}
    </li>
  </ol>
  {#if created}
    <p class="form-note" role="status">
      {online
        ? 'Connected. Claude Code’s models are now in your model list.'
        : 'Waiting for the computer to connect…'}
    </p>
  {/if}
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  <div class="dialog-actions">
    <button class="button primary" onclick={() => dialog?.close()}
      >{online ? 'Done' : 'Close'}</button
    >
  </div>
</dialog>
