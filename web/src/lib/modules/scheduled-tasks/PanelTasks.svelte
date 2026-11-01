<script lang="ts">
  import { CalendarClock, Plus } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import type { ScheduledTask, Session } from '@crewstead/core/protocol';
  import { tasks } from './api.ts';
  import TaskDialog from './TaskDialog.svelte';
  import TaskList from './TaskList.svelte';
  let { session }: { session: Session } = $props();
  let list = $state<ScheduledTask[]>([]);
  let error = $state('');
  let editing = $state<{ task?: ScheduledTask }>();
  async function load() {
    list = await tasks.list(session.id).catch(() => list);
  }
  // The models' tasks use this browser's time zone too.
  $effect(() => void tasks.saveZone());
  // Loaded again as the model schedules or deletes tasks and as tasks run.
  const calls = $derived(
    session.items
      .filter((item) => item.toolName?.startsWith('schedule_') || item.scheduled)
      .map((item) => `${item.id}:${item.status}`)
      .join(),
  );
  $effect(() => {
    void session.id;
    void calls;
    void load();
  });
</script>

<section class="panel-section" aria-label="Scheduled tasks">
  <h3>
    <CalendarClock size={13} />Scheduled{#if list.length}<span>{list.length}</span>{/if}
  </h3>
  {#if list.length}
    <TaskList
      {list}
      edit={(task) => (editing = { task })}
      changed={(problem) => {
        error = problem ?? '';
        void load();
      }}
    />
  {:else}<p class="panel-empty">
      Nothing yet. Schedule a prompt to run here later or on repeat, or ask the model to.
    </p>{/if}
  {#if error}<p class="panel-empty failed" role="alert">{error}</p>{/if}
  <div class="panel-actions">
    <button class="button subtle small" onclick={() => (editing = {})}
      ><Plus size={13} /> Schedule</button
    >
    <a class="panel-link" href={resolve('/settings?tab=scheduled')}>All tasks</a>
  </div>
</section>
{#if editing}<TaskDialog
    chatId={session.id}
    {...editing.task ? { task: editing.task } : {}}
    close={(saved) => {
      editing = undefined;
      if (saved) void load();
    }}
  />{/if}
