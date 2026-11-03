<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { request } from '#lib/api.ts';
  let { enabled }: { enabled: boolean } = $props();
  const workspace = useWorkspace();
  const id = $props.id();
  let dialog = $state<HTMLDialogElement>();
  let busy = $state(false);
  let error = $state('');
  async function toggle() {
    busy = true;
    error = '';
    try {
      await request('/modules/mock-provider', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !enabled }),
      });
      await workspace.refresh();
      dialog?.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not change this setting';
    } finally {
      busy = false;
    }
  }
</script>

{#if enabled}
  <button class="button subtle" onclick={() => dialog?.showModal()}>Turn off</button>
  <dialog
    {@attach closeOutside}
    bind:this={dialog}
    class="dialog-content"
    aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`}
  >
    <h2 id={`${id}-title`} class="dialog-title">Turn off test replies?</h2>
    <p id={`${id}-description`} class="dialog-description">
      Any test reply in progress stops. Your chats stay readable.
    </p>
    {#if error}<p role="alert" class="error-banner">{error}</p>{/if}
    <div class="dialog-actions">
      <button class="button subtle" onclick={() => dialog?.close()}>Cancel</button><button
        class="button danger"
        disabled={busy}
        onclick={toggle}>{busy ? 'Turning off…' : 'Turn off'}</button
      >
    </div>
  </dialog>
{:else}
  <button class="button primary" disabled={busy} onclick={toggle}
    >{busy ? 'Turning on…' : 'Turn on'}</button
  >
  {#if error}<p role="alert">{error}</p>{/if}
{/if}
