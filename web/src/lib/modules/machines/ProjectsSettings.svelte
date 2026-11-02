<script lang="ts">
  import { onMount } from 'svelte';
  import { Plus } from '@lucide/svelte';
  import type { MachineView } from '@crewstead/core/protocol';
  import { machines } from './api.ts';
  import AddProject from './AddProject.svelte';
  import ProjectRow from './ProjectRow.svelte';
  import WholeComputerRow from './WholeComputerRow.svelte';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/providers.css';
  import '@crewstead/ui/projects.css';
  let list = $state<MachineView[]>([]);
  let loaded = $state(false);
  let error = $state('');
  let adding = $state<MachineView>();
  async function load() {
    try {
      list = await machines.list();
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load projects';
    } finally {
      loaded = true;
    }
  }
  /** After a change: reload, and show what went wrong if anything did. */
  async function changed(problem?: string) {
    await load();
    if (problem) error = problem;
  }
  onMount(() => {
    void load();
    // Projects change when they are added on a computer, or it goes on- or offline.
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  });
</script>

<section class="settings-section" aria-label="Projects">
  <h2>Projects</h2>
  <p class="muted-text">
    Where chats can work on your computers: a project folder (files, and commands in a sandbox), or
    the whole computer as you, when you turn that on there. Pick one in the prompt box.
  </p>
  {#each list as machine (machine.id)}
    <div class="provider-group" role="group" aria-label={`Projects on ${machine.name}`}>
      <div class="provider-head">
        <span class="row-text"
          ><strong>{machine.name}</strong><small class="machine-status"
            ><span class="status-dot" class:online={machine.online}></span>{machine.online
              ? 'Online'
              : 'Offline'}</small
          ></span
        >
        {#if machine.online && machine.folders.length}
          <button class="button subtle small add-project-button" onclick={() => (adding = machine)}
            ><Plus size={14} />Add project</button
          >
        {/if}
      </div>
      <ul aria-label={`Project folders on ${machine.name}`}>
        {#if machine.online}<WholeComputerRow {machine} {changed} />{/if}
        {#each machine.projects as project (project.id)}
          <ProjectRow
            machineId={machine.id}
            {project}
            sandbox={machine.sandbox}
            browser={machine.browser}
            online={machine.online}
            {changed}
          />
        {:else}
          <li class="provider-empty">No projects on this computer yet.</li>
        {/each}
        {#if machine.projects.length && !machine.sandbox}<li class="provider-empty">
            Commands are off here: install bubblewrap (bwrap) to run them in a sandbox.
          </li>{/if}
        {#if machine.projects.length && machine.online && !machine.browser}<li
            class="provider-empty"
          >
            No browser here yet: run <code>crewstead install-browser</code> on that computer.
          </li>{/if}
        {#if machine.online && !machine.folders.length}<li class="provider-empty">
            To add projects from here, first allow a folder on that computer (below).
          </li>{/if}
      </ul>
    </div>
  {:else}
    {#if loaded}<p class="muted-text">
        Connect a computer under Models → Connect provider → Claude Code first.
      </p>{/if}
  {/each}
  <div class="settings-card how-to">
    <p>
      For safety, this page can only add projects inside folders you allow on the computer itself:
    </p>
    <pre><code
        >crewstead allow ~/Projects
crewstead add &lt;folder&gt; [name]
crewstead computer on</code
      ></pre>
    <p class="muted-text">Removing a project never touches its files.</p>
  </div>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
</section>

{#if adding}
  <AddProject
    machine={adding}
    close={(added) => {
      adding = undefined;
      if (added) void load();
    }}
  />
{/if}
