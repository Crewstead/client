<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import EmptyState from '#lib/components/EmptyState.svelte';
  import LoadingRows from '#lib/components/LoadingRows.svelte';
  import { onMount } from 'svelte';
  import { Monitor, Plus } from '@lucide/svelte';
  import type { MachineView } from '@crewstead/core/protocol';
  import { machines, machineState } from './api.ts';
  import ProjectRow from './ProjectRow.svelte';
  import WholeComputerRow from './WholeComputerRow.svelte';
  import TerminalsRow from './TerminalsRow.svelte';
  import ConnectComputer from './ConnectComputer.svelte';
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
  let connecting = $state(false);
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
      error = cause instanceof Error ? cause.message : 'Could not load your computers.';
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

<section class="settings-section" aria-label="Computers">
  <SettingsHeading page title="Computers">
    Where chats can work: in a project folder, or on the whole computer when you allow it there.
    Choose one in the prompt box.
    {#snippet action()}{#if desktop?.addProject}<button
          class="button subtle small"
          disabled={adding}
          onclick={addProject}><Plus size={14} aria-hidden="true" />Add project</button
        >{/if}{/snippet}
  </SettingsHeading>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  {#if !loaded}
    <div class="settings-card"><LoadingRows label="Loading your computers" rows={3} /></div>
  {/if}
  <div class="computer-list">
    {#each list as machine (machine.id)}
      <div
        class="settings-card provider-groups computer-card"
        role="group"
        aria-label={`Computer ${machine.name}`}
      >
        <div class="provider-group">
          <div class="provider-head">
            <Monitor size={18} aria-hidden="true" />
            <span class="project-text">
              <span class="row-name">{machine.name}</span>
              <span class="row-status" role="status"
                ><span class="status-dot" class:online={machine.online}></span>{machineState(
                  machine,
                )}</span
              >
            </span>
          </div>
          <ul aria-label={`Project folders on ${machine.name}`}>
            {#if !machine.online}
              <li class="provider-empty">
                Crewstead is not running there or cannot reach this hub. Open the Crewstead app on {machine.name}
                to use it again; its projects come back as they were.
              </li>
            {/if}
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
              <li class="provider-empty">
                No projects on this computer yet.{#if !desktop?.addProject}
                  Add one in the Crewstead app there, or run <code
                    >crewstead add &lt;folder&gt;</code
                  >
                  in a terminal there.{/if}
              </li>
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
      </div>
    {/each}
  </div>
  {#if loaded && !list.length}
    <EmptyState
      text="No computers yet. Sign in to this hub in the Crewstead app on a computer and let chats use it, or connect one here."
    >
      {#snippet action()}<button class="button subtle small" onclick={() => (connecting = true)}
          >Connect a computer</button
        >{/snippet}
    </EmptyState>
  {/if}
  {#if loaded && list.length}
    <p class="settings-footnote">
      {#if desktop?.addProject}
        Add project picks a folder on this computer; to add one on another computer, open Crewstead
        there.
      {:else}
        Projects are added on the computer itself: in the Crewstead app there, or with
        <code>crewstead add &lt;folder&gt;</code> in a terminal there.
      {/if}
      Whole-computer chats are turned on there with <code>crewstead computer on</code>. Removing a
      project never touches its files.
    </p>
  {/if}
</section>
{#if connecting}<ConnectComputer
    close={() => {
      connecting = false;
      void load();
    }}
  />{/if}
