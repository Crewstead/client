<script lang="ts">
  import { onMount } from 'svelte';
  import { Plus } from '@lucide/svelte';
  import type { MachineView } from '@crewstead/core/protocol';
  import { machines } from './api.ts';
  import ProjectRow from './ProjectRow.svelte';
  import WholeComputerRow from './WholeComputerRow.svelte';
  import TerminalsRow from './TerminalsRow.svelte';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/providers.css';
  import '@crewstead/ui/projects.css';
  let list = $state<MachineView[]>([]);
  let loaded = $state(false);
  let error = $state('');
  /** Inside the Crewstead app, which can pick a folder on this computer; absent in a browser. */
  const desktop = (globalThis as { crewsteadDesktop?: { addProject?: () => Promise<string> } })
    .crewsteadDesktop;
  let adding = $state(false);
  async function addProject() {
    adding = true;
    const problem = await desktop!.addProject!().catch(() => 'Could not add that folder.');
    adding = false;
    if (problem === 'cancelled') return;
    // The computer tells the hub about the new project a moment later.
    await changed(problem || undefined);
    if (!problem) setTimeout(load, 1_500);
  }
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
  <div class="projects-heading">
    <h2>Projects</h2>
    {#if desktop?.addProject}<button
        class="button subtle small"
        disabled={adding}
        onclick={addProject}><Plus size={14} /> Add project</button
      >{/if}
  </div>
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
      </div>
      <ul aria-label={`Project folders on ${machine.name}`}>
        {#if machine.online}<WholeComputerRow {machine} {changed} /><TerminalsRow
            {machine}
            {changed}
          />{/if}
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
      </ul>
    </div>
  {:else}
    {#if loaded}<p class="muted-text">
        Connect a computer under Models → Connect provider → Claude Code first.
      </p>{/if}
  {/each}
  <div class="settings-card how-to">
    {#if desktop?.addProject}
      <p>
        Add project picks a folder on this computer. To add one on another computer, open Crewstead
        there.
      </p>
    {:else}
      <p>
        Projects are added on the computer itself: in the Crewstead app there (Settings → Projects →
        Add project), or in a terminal there:
      </p>
      <pre><code>crewstead add &lt;folder&gt; [name]</code></pre>
    {/if}
    <p class="muted-text">
      Whole-computer chats are turned on there with <code>crewstead computer on</code>. Removing a
      project never touches its files.
    </p>
  </div>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
</section>
