<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import EmptyState from '#lib/components/EmptyState.svelte';
  import LoadingRows from '#lib/components/LoadingRows.svelte';
  import type { ScheduledTask } from '@crewstead/core/protocol';
  import { tasks } from './api.ts';
  import TaskDialog from './TaskDialog.svelte';
  import TaskList from './TaskList.svelte';
  import '@crewstead/ui/settings-cards.css';
  let list = $state<ScheduledTask[]>();
  let error = $state('');
  let editing = $state<ScheduledTask>();
  async function refresh() {
    try {
      list = await tasks.list();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load scheduled tasks.';
    }
  }
  $effect(() => void refresh());
  $effect(() => void tasks.saveZone());
</script>

<section class="settings-section" aria-label="Scheduled">
  <SettingsHeading page title="Scheduled tasks">
    Prompts sent into a chat at set times. A run is posted in its chat only when it has something to
    tell you; every run is kept in the task’s history.
  </SettingsHeading>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  {#if list?.length}
    <div class="settings-card">
      <TaskList
        {list}
        showChat
        edit={(task) => (editing = task)}
        changed={(problem) => {
          error = problem ?? '';
          void refresh();
        }}
      />
    </div>
  {:else if list}
    <EmptyState
      text="No scheduled tasks yet. Add one from a chat’s side panel, or ask a chat to schedule something."
    />
  {:else}
    <div class="settings-card"><LoadingRows label="Loading scheduled tasks" /></div>
  {/if}
</section>
{#if editing}<TaskDialog
    chatId={editing.chatId}
    task={editing}
    close={(saved) => {
      editing = undefined;
      if (saved) void refresh();
    }}
  />{/if}
