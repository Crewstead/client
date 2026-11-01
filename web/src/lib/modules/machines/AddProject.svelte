<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronRight, Folder } from '@lucide/svelte';
  import type { FolderEntry, MachineView } from '@crewstead/core/protocol';
  import { computerProjects } from './api.ts';
  let { machine, close }: { machine: MachineView; close: (added: boolean) => void } = $props();
  const id = $props.id();
  let dialog = $state<HTMLDialogElement>();
  // svelte-ignore state_referenced_locally
  let folderId = $state(machine.folders[0]?.id ?? '');
  /** The open folder, as names below the allowed folder. */
  let trail = $state<string[]>([]);
  let entries = $state<FolderEntry[]>([]);
  let more = $state(false);
  let loading = $state(true);
  let adding = $state('');
  let added = $state(false);
  let error = $state('');
  const folder = $derived(machine.folders.find((entry) => entry.id === folderId));
  const path = (names: string[]) => names.join('/');

  async function open(names: string[]) {
    loading = true;
    error = '';
    try {
      const listing = await computerProjects.browse(machine.id, folderId, path(names));
      trail = names;
      entries = listing.entries;
      more = listing.more;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not open this folder';
    } finally {
      loading = false;
    }
  }
  async function add(names: string[]) {
    adding = path(names) || '.';
    error = '';
    try {
      await computerProjects.add(machine.id, folderId, path(names));
      added = true;
      await open(trail);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not add this folder';
    } finally {
      adding = '';
    }
  }
  onMount(() => {
    dialog?.showModal();
    void open([]);
  });
</script>

<dialog
  bind:this={dialog}
  class="dialog-content wide-dialog add-project"
  aria-labelledby={`${id}-title`}
  onclose={() => close(added)}
>
  <h2 id={`${id}-title`} class="dialog-title">Add a project on {machine.name}</h2>
  <p class="dialog-description">
    Pick a folder for chats to work in. Only folders you allowed on that computer are shown.
  </p>
  {#if machine.folders.length > 1}
    <select
      class="folder-select"
      aria-label="Allowed folder"
      bind:value={folderId}
      onchange={() => open([])}
    >
      {#each machine.folders as entry (entry.id)}<option value={entry.id}>{entry.path}</option
        >{/each}
    </select>
  {/if}
  <nav class="folder-trail" aria-label="Folder">
    <button class="trail-step" disabled={!trail.length} onclick={() => open([])}
      >{folder?.path ?? ''}</button
    >
    {#each trail as name, index (index)}
      <ChevronRight size={13} />
      <button
        class="trail-step"
        disabled={index === trail.length - 1}
        onclick={() => open(trail.slice(0, index + 1))}>{name}</button
      >
    {/each}
  </nav>
  <ul class="folder-list" aria-label="Folders" aria-busy={loading}>
    {#each entries as entry (entry.name)}
      <li>
        <button class="folder-open" onclick={() => open([...trail, entry.name])}
          ><Folder size={15} /><span>{entry.name}</span></button
        >
        {#if entry.project}<span class="folder-added">Added</span>{:else}<button
            class="button subtle small"
            disabled={!!adding}
            aria-label={`Add ${entry.name}`}
            onclick={() => add([...trail, entry.name])}
            >{adding === path([...trail, entry.name]) ? 'Adding…' : 'Add'}</button
          >{/if}
      </li>
    {:else}
      {#if !loading}<li class="provider-empty">No folders here.</li>{/if}
    {/each}
    {#if more}<li class="provider-empty">Only the first 500 folders are shown.</li>{/if}
  </ul>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  <div class="dialog-actions">
    {#if trail.length}
      <button class="button subtle" disabled={!!adding} onclick={() => add(trail)}
        >Add “{trail.at(-1)}”</button
      >
    {/if}
    <button class="button primary" onclick={() => dialog?.close()}>Done</button>
  </div>
</dialog>
