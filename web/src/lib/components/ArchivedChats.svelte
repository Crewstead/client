<script lang="ts">
  import { resolve } from '$app/paths';
  import { ArchiveRestore, Trash2 } from '@lucide/svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import '@crewstead/ui/dialogs.css';
  const workspace = useWorkspace();
  const id = $props.id();
  const archived = $derived(workspace.sessions.filter((session) => session.archived));
  let busy = $state('');
  let error = $state('');
  let dialog = $state<HTMLDialogElement>();
  /** The chat to delete, or 'all' for every archived chat. */
  let target = $state<{ id: string; title: string } | 'all'>();
  async function run(key: string, work: () => Promise<void>, failure: string) {
    busy = key;
    error = '';
    try {
      await work();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : failure;
    } finally {
      busy = '';
    }
  }
  const restore = (sessionId: string) =>
    run(
      sessionId,
      () => workspace.setPreferences(sessionId, { archived: false }),
      'Could not restore chat',
    );
  function confirm(chosen: { id: string; title: string } | 'all') {
    target = chosen;
    dialog?.showModal();
  }
  const remove = () => {
    const chosen = target;
    dialog?.close();
    if (!chosen) return;
    void run(
      chosen === 'all' ? 'all' : chosen.id,
      () => workspace.deleteArchived(chosen === 'all' ? undefined : chosen.id),
      'Could not delete',
    );
  };
</script>

<section class="settings-section archived-chats" aria-label="Archived chats">
  <div class="section-heading">
    <h2>Archived chats</h2>
    {#if archived.length}<button
        class="button subtle small"
        disabled={!!busy}
        onclick={() => confirm('all')}>Delete all</button
      >{/if}
  </div>
  {#if archived.length}
    <ul>
      {#each archived as session (session.id)}
        <li>
          <a href={resolve('/sessions/[id]', { id: session.id })}>{session.title}</a><button
            class="icon-button"
            aria-label={`Restore ${session.title}`}
            title="Restore chat"
            disabled={!!busy}
            onclick={() => restore(session.id)}><ArchiveRestore size={16} /></button
          ><button
            class="icon-button danger-icon"
            aria-label={`Delete ${session.title}`}
            title="Delete for good"
            disabled={!!busy}
            onclick={() => confirm(session)}><Trash2 size={16} /></button
          >
        </li>
      {/each}
    </ul>
  {:else}<p class="muted-text">No archived chats.</p>{/if}
</section>
{#if error}<p class="error-banner" role="alert">{error}</p>{/if}

<dialog bind:this={dialog} class="dialog-content" aria-labelledby={`${id}-delete`}>
  <h2 id={`${id}-delete`} class="dialog-title">
    {target === 'all'
      ? `Delete ${archived.length} archived chat${archived.length === 1 ? '' : 's'}?`
      : `Delete “${target?.title ?? ''}”?`}
  </h2>
  <p class="dialog-description">
    {target === 'all' ? 'They are' : 'It is'} removed for good, with every message. This can’t be undone.
  </p>
  <div class="dialog-actions">
    <button class="button subtle" onclick={() => dialog?.close()}>Cancel</button>
    <button class="button danger" onclick={remove}>Delete</button>
  </div>
</dialog>
