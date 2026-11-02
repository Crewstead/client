<script lang="ts">
  import { ChevronDown, Cloud, Folder, FolderX, Monitor } from '@lucide/svelte';
  import type { Project } from '@crewstead/core/protocol';
  import PlaceDialog from './PlaceDialog.svelte';
  import '@crewstead/ui/model-picker.css';
  import '@crewstead/ui/place-dialog.css';
  let {
    projects,
    value = $bindable(),
    disabled = false,
  }: {
    projects: Project[];
    /** The project id, or '' for the cloud. */
    value: string;
    disabled?: boolean;
  } = $props();
  const chosen = $derived(projects.find((project) => project.id === value));
  // A chat's project whose computer is offline is not in the list; it still shows, marked.
  // The computer comes first: "MAIN-PC / Crewstead", "MAIN-PC / Whole computer".
  const label = $derived(
    chosen ? `${chosen.machine} / ${chosen.name}` : value ? 'Project offline' : 'Cloud',
  );
  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
</script>

<!-- Where the chat works: the cloud (the hub only), or a project on one of the owner's computers. -->
{#if disabled}
  <span class="model-label">{label}</span>
{:else}
  <button
    bind:this={trigger}
    class="place-trigger project-picker"
    class:offline={value && !chosen}
    aria-haspopup="dialog"
    aria-label={`Where: ${label}`}
    title={`Where: ${label}`}
    onclick={() => (open = true)}
    >{#if !value}<Cloud size={13} />{:else if !chosen}<FolderX
        size={13}
      />{:else if chosen.kind === 'computer'}<Monitor size={13} />{:else}<Folder
        size={13}
      />{/if}<span class="picker-label">{label}</span><ChevronDown size={12} /></button
  >
{/if}
{#if open}<PlaceDialog
    {projects}
    {value}
    choose={(id) => (value = id)}
    close={() => {
      open = false;
      trigger?.focus();
    }}
  />{/if}
