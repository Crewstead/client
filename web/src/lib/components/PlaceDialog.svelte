<script lang="ts">
  import { Check, Cloud, Folder, FolderPlus, Laptop, Monitor, Search } from '@lucide/svelte';
  import type { Project } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/search.css';
  import '@crewstead/ui/place-dialog.css';
  let {
    projects,
    value,
    choose,
    close,
  }: {
    projects: Project[];
    /** The project id, or '' for the cloud. */
    value: string;
    choose: (id: string) => void;
    close: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  const workspace = useWorkspace();
  /** Inside the Crewstead app, which can pick a folder on this computer; absent in a browser. */
  const desktop = (globalThis as { crewsteadDesktop?: { addProject?: () => Promise<string> } })
    .crewsteadDesktop;
  let adding = $state(false);
  let problem = $state('');
  /** Adds a folder of this computer as a project and, once the hub lists it, chooses it. */
  async function addProject() {
    adding = true;
    problem = '';
    const before = new Set(projects.map((project) => project.id));
    const answer = await desktop!.addProject!().catch(() => 'Could not add that folder.');
    if (answer) {
      if (answer !== 'cancelled') problem = answer;
      adding = false;
      return;
    }
    // The computer tells the hub about it a moment later.
    for (let attempt = 0; attempt < 12; attempt++) {
      await workspace.refresh();
      const added = projects.find((project) => !before.has(project.id));
      if (added) return pick(added.id);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    adding = false;
    problem = 'Added. It will show here once the computer reports it.';
  }
  let query = $state('');
  let active = $state(0);
  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const matches = (...texts: string[]) =>
    words.every((word) => texts.some((text) => text.toLowerCase().includes(word)));
  const showCloud = $derived(matches('Cloud', 'hub'));
  /** Matching projects under the computer they are on, computers in the order their projects come. */
  const computers = $derived(
    projects
      .filter((project) => matches(project.name, project.path, project.machine))
      .reduce<{ name: string; projects: Project[] }[]>((list, project) => {
        const computer = list.find((entry) => entry.name === project.machine);
        if (computer) computer.projects.push(project);
        else list.push({ name: project.machine, projects: [project] });
        return list;
      }, []),
  );
  /** Every choice shown, in order, for the arrow keys. */
  const choices = $derived([
    ...(showCloud ? [''] : []),
    ...computers.flatMap((computer) => computer.projects.map((project) => project.id)),
  ]);
  // Starts on the current place, and keeps the highlight on something shown while typing.
  $effect(() => {
    const at = choices.indexOf(value);
    active = query ? 0 : Math.max(at, 0);
  });
  function pick(id: string) {
    choose(id);
    dialog.close();
  }
  function keys(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!choices.length) return;
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      queueMicrotask(() =>
        dialog.querySelector('.place-choice.active')?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (event.key === 'Enter' && choices[active] !== undefined) {
      event.preventDefault();
      pick(choices[active]!);
    }
  }
</script>

{#snippet choice(id: string, name: string, detail: string, kind: 'cloud' | 'computer' | 'project')}
  <button
    class="place-choice"
    class:active={choices[active] === id}
    role="option"
    aria-selected={value === id}
    title={detail}
    onclick={() => pick(id)}
    onmouseenter={() => (active = choices.indexOf(id))}
  >
    {#if kind === 'cloud'}<Cloud size={15} />{:else if kind === 'computer'}<Monitor
        size={15}
      />{:else}<Folder size={15} />{/if}
    <span><strong>{name}</strong><small>{detail}</small></span>
    {#if value === id}<Check size={15} />{/if}
  </button>
{/snippet}

<!-- Where a chat works, chosen from a list that stays readable with many projects. -->
<dialog
  class="dialog-content place-dialog"
  aria-label="Where the chat works"
  bind:this={dialog}
  {@attach (node) => node.showModal()}
  onclose={close}
  onclick={(event) => {
    if (event.target === event.currentTarget) dialog.close();
  }}
>
  <div class="search-field">
    <Search size={16} aria-hidden="true" />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      aria-label="Find a project"
      placeholder="Find a project, folder or computer"
      autocomplete="off"
      autofocus
      bind:value={query}
      onkeydown={keys}
    />
  </div>
  <div class="place-choices" role="listbox" aria-label="Places">
    {#if showCloud}
      {@render choice(
        '',
        'Cloud',
        'On the hub only: talk, skills and a browser for public websites',
        'cloud',
      )}
    {/if}
    {#each computers as computer (computer.name)}
      <p class="place-heading"><Laptop size={12} /> {computer.name}</p>
      {#each computer.projects as project (project.id)}
        {@render choice(
          project.id,
          project.name,
          project.kind === 'computer'
            ? 'Anywhere, as you; changes ask first'
            : `${project.path}${project.sandbox ? '' : ' · no commands'}`,
          project.kind === 'computer' ? 'computer' : 'project',
        )}
      {/each}
    {/each}
    {#if !choices.length}<p class="place-empty">Nothing matches “{query.trim()}”.</p>{/if}
  </div>
  <div class="place-footer">
    {#if desktop?.addProject}
      <button class="button subtle small" disabled={adding} onclick={addProject}
        ><FolderPlus size={14} /> {adding ? 'Adding…' : 'Add project'}</button
      >
      {#if problem}<span role="status">{problem}</span>{/if}
    {:else}
      <span>To add a project, open Crewstead on that computer: Add project is there.</span>
    {/if}
  </div>
</dialog>
