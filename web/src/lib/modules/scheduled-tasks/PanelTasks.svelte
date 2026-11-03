<script lang="ts">
  import PanelSection from '#lib/components/panel/PanelSection.svelte';
  import { CalendarClock } from '@lucide/svelte';
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

<PanelSection
  id="scheduled"
  label="Scheduled tasks"
  title="Scheduled"
  icon={CalendarClock}
  count={list.length || undefined}
  empty={!list.length}
  add={{ label: 'Schedule a task', run: () => (editing = {}) }}
>
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
    <a class="panel-link" href={resolve('/settings?tab=scheduled')}>All tasks</a>
  </div>
</PanelSection>
{#if editing}<TaskDialog
    chatId={session.id}
    {...editing.task ? { task: editing.task } : {}}
    close={(saved) => {
      editing = undefined;
      if (saved) void load();
    }}
  />{/if}
