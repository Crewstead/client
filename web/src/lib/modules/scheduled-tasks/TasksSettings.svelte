<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
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
  <SettingsHeading title="Scheduled tasks">
    Prompts sent into a chat at set times, where its model answers them as if you had just written
    them. Add one from a chat’s side panel, or ask the model in a chat to schedule something.
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
  {:else if list}<p class="empty-note">No scheduled tasks yet.</p>{/if}
</section>
{#if editing}<TaskDialog
    chatId={editing.chatId}
    task={editing}
    close={(saved) => {
      editing = undefined;
      if (saved) void refresh();
    }}
  />{/if}
