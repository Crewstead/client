<script lang="ts">
  import { Check, Cloud, Folder, Laptop, Monitor } from '@lucide/svelte';
  import type { Session } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import '@crewstead/ui/dialogs.css';
  let { session, close }: { session: Omit<Session, 'items'>; close: () => void } = $props();
  const workspace = useWorkspace();
  const id = $props.id();
  const projects = $derived(workspace.catalog?.projects ?? []);
  const computers = $derived(
    projects.reduce<string[]>(
      (list, project) => (list.includes(project.machine) ? list : [...list, project.machine]),
      [],
    ),
  );
  let busy = $state(false);
  let error = $state('');
  async function move(projectId: string | null, dialog: HTMLDialogElement) {
    if ((projectId ?? undefined) === session.projectId) return dialog.close();
    busy = true;
    error = '';
    try {
      await workspace.move(session.id, projectId);
      dialog.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'The chat could not be moved.';
    } finally {
      busy = false;
    }
  }
</script>

<!-- Where a chat works, changed without sending a message; the keyboard way to do what dragging does. -->
<dialog
  class="dialog-content move-chat"
  aria-labelledby={`${id}-title`}
  {@attach (node) => node.showModal()}
  onclose={close}
>
  <h2 id={`${id}-title`} class="dialog-title">Move “{session.title}”</h2>
  <p class="dialog-description">It continues there from its next reply. Its browsers here close.</p>
  <ul class="move-places" aria-label="Places">
    <li>
      <button
        disabled={busy}
        onclick={(event) => move(null, event.currentTarget.closest('dialog')!)}
        ><Cloud size={14} /><span>Cloud <small>On the hub only</small></span
        >{#if !session.projectId}<Check size={14} />{/if}</button
      >
    </li>
    {#each computers as computer (computer)}
      <li class="move-computer"><Laptop size={12} /> {computer}</li>
      {#each projects.filter((project) => project.machine === computer) as project (project.id)}
        <li>
          <button
            disabled={busy}
            onclick={(event) => move(project.id, event.currentTarget.closest('dialog')!)}
            >{#if project.kind === 'computer'}<Monitor size={14} />{:else}<Folder
                size={14}
              />{/if}<span
              >{project.name}
              <small>{project.kind === 'computer' ? 'Anywhere, as you' : project.path}</small></span
            >{#if session.projectId === project.id}<Check size={14} />{/if}</button
          >
        </li>
      {/each}
    {/each}
  </ul>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  <div class="dialog-actions">
    <button
      class="button subtle"
      onclick={(event) => event.currentTarget.closest('dialog')?.close()}>Cancel</button
    >
  </div>
</dialog>
