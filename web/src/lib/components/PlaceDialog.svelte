<script lang="ts">
  import { untrack } from 'svelte';
  import { closeOutside } from '#lib/close-outside.ts';
  import {
    Check,
    Cloud,
    Folder,
    Laptop,
    LoaderCircle,
    Monitor,
    Plus,
    Search,
  } from '@lucide/svelte';
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
    label = 'Where the chat works',
  }: {
    projects: Project[];
    /** The project id, or '' for the cloud. */
    value: string;
    /** Takes the place; a promise that fails keeps the dialog open with its message. */
    choose: (id: string) => unknown;
    close: () => void;
    /** What the dialog is for, for screen readers; by default choosing where a chat works. */
    label?: string;
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
  /** The highlighted place, by id: the list is read again every few seconds, and that must not move it. */
  let active = $state<string>();
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
  // Starts on the current place; typing moves it to the first match. Only typing moves it: a
  // refreshed list leaves it where the pointer or the arrow keys put it.
  $effect(() => {
    const typed = query;
    untrack(() => (active = typed ? choices[0] : value));
  });
  let picking = $state(false);
  async function pick(id: string) {
    if (picking) return;
    picking = true;
    problem = '';
    try {
      await choose(id);
      dialog.close();
    } catch (cause) {
      problem = cause instanceof Error ? cause.message : 'That did not work.';
    } finally {
      picking = false;
    }
  }
  function keys(event: KeyboardEvent) {
    const at = active === undefined ? -1 : choices.indexOf(active);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!choices.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = choices[(Math.max(at, step > 0 ? -1 : 0) + step + choices.length) % choices.length];
      queueMicrotask(() =>
        dialog.querySelector('.place-choice.active')?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (event.key === 'Enter' && at >= 0) {
      event.preventDefault();
      void pick(choices[at]!);
    }
  }
</script>

{#snippet choice(id: string, name: string, detail: string, kind: 'cloud' | 'computer' | 'project')}
  <button
    type="button"
    class="place-choice"
    class:active={active === id}
    role="option"
    aria-selected={value === id}
    title={detail}
    disabled={picking}
    onclick={() => pick(id)}
    onmouseenter={() => (active = id)}
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
  {@attach closeOutside}
  class="dialog-content place-dialog"
  aria-label={label}
  bind:this={dialog}
  {@attach (node) => node.showModal()}
  onclose={close}
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
    {#if desktop?.addProject}
      <button
        type="button"
        class="icon-button place-add"
        aria-label="Add project"
        title="Add project: pick a folder on this computer"
        disabled={adding}
        onclick={addProject}
        >{#if adding}<LoaderCircle size={18} class="place-spin" />{:else}<Plus
            size={18}
          />{/if}</button
      >
    {/if}
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
            : `${project.path}${project.sandbox ? '' : ' · no sandbox'}`,
          project.kind === 'computer' ? 'computer' : 'project',
        )}
      {/each}
    {/each}
    {#if !choices.length}<p class="place-empty">Nothing matches “{query.trim()}”.</p>{/if}
  </div>
  {#if problem}
    <p class="place-footer" role="status">{problem}</p>
  {:else if !desktop?.addProject}
    <p class="place-footer">
      To add a project, open Crewstead on that computer: Add project is there.
    </p>
  {/if}
</dialog>
