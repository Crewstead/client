<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import { resolve } from '$app/paths';
  import { ArchiveRestore, Trash2 } from '@lucide/svelte';
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import EmptyState from '#lib/components/EmptyState.svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/projects.css';
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
      'Could not restore the chat.',
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
      'Could not delete.',
    );
  };
  const day = (value: string) =>
    new Date(value).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
</script>

<section class="settings-section" aria-label="Archived chats">
  <SettingsHeading page title="Archived chats">
    Chats you archived stay here until you restore or delete them.
    {#snippet action()}{#if archived.length}<button
          class="button subtle small"
          disabled={!!busy}
          onclick={() => confirm('all')}>Delete all…</button
        >{/if}{/snippet}
  </SettingsHeading>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  {#if archived.length}
    <div class="settings-card">
      <ul aria-label="Archived chats">
        {#each archived as session (session.id)}
          <li>
            <span class="project-text">
              <a class="row-name" href={resolve('/sessions/[id]', { id: session.id })}
                >{session.title}</a
              >
              <span class="row-status">Last active {day(session.updatedAt)}</span>
            </span>
            <button
              class="button subtle small"
              aria-label={`Restore ${session.title}`}
              disabled={!!busy}
              onclick={() => restore(session.id)}
              ><ArchiveRestore size={15} aria-hidden="true" />Restore</button
            >
            <button
              class="icon-button danger-icon"
              aria-label={`Delete ${session.title}`}
              title="Delete for good"
              disabled={!!busy}
              onclick={() => confirm(session)}><Trash2 size={16} /></button
            >
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <EmptyState
      text="No archived chats. Archive a chat from its menu to keep it out of the list."
    />
  {/if}
</section>

<dialog
  {@attach closeOutside}
  bind:this={dialog}
  class="dialog-content"
  aria-labelledby={`${id}-delete`}
>
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
