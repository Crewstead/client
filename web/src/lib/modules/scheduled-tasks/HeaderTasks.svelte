<script lang="ts">
  import { resolve } from '$app/paths';
  import { CalendarClock, List, Plus } from '@lucide/svelte';
  import type { ScheduledTask, Session } from '@crewstead/core/protocol';
  import HeaderPopover from '#lib/components/HeaderPopover.svelte';
  import { tasks } from './api.ts';
  import TaskDialog from './TaskDialog.svelte';
  import TaskList from './TaskList.svelte';
  let { session, extras }: { session: Session; extras: Record<string, unknown> } = $props();
  /** The chat's tasks, once read; until then the soonest run came with the chat itself. */
  let list = $state<ScheduledTask[]>();
  let error = $state('');
  let open = $state(false);
  let editing = $state<{ task?: ScheduledTask }>();
  async function load() {
    const chat = session.id;
    const read = await tasks.list(chat).catch(() => undefined);
    if (read && chat === session.id) list = read;
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
  // Another chat starts from what came with it, until its own tasks are read.
  let shownFor = '';
  $effect(() => {
    if (shownFor !== session.id) list = undefined;
    shownFor = session.id;
    void calls;
    void load();
  });
  /** The soonest run of the chat's tasks that are on. */
  const next = $derived(
    list
      ? list
          .filter((task) => task.enabled && task.nextRunAt)
          .map((task) => task.nextRunAt!)
          .sort()[0]
      : (extras.scheduled as { next?: string } | undefined)?.next,
  );
  // Once that run is due, the tasks are read again for the one after it (a run that posts nothing
  // leaves no trace in the chat to prompt that). A time already past is tried again every 30s.
  let tick = $state(0);
  $effect(() => {
    void tick;
    if (!next) return;
    const due = Date.parse(next) - Date.now();
    const timer = setTimeout(
      () => {
        tick++;
        void load();
      },
      due > 0 ? Math.min(due + 2_000, 86_400_000) : 30_000,
    );
    return () => clearTimeout(timer);
  });
  /** Today, just the time; another day, its weekday too (its date when more than a week away). */
  function when(iso: string) {
    const at = new Date(iso);
    const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (at.toDateString() === new Date().toDateString()) return time;
    const soon = at.getTime() - Date.now() < 6 * 86_400_000;
    const day = at.toLocaleDateString(
      undefined,
      soon ? { weekday: 'short' } : { month: 'short', day: 'numeric' },
    );
    return `${day} ${time}`;
  }
  function schedule() {
    open = false;
    editing = {};
  }
</script>

<HeaderPopover
  bind:open
  wide
  label={next ? `Scheduled, next ${when(next)}` : 'Scheduled'}
  heading="Scheduled tasks"
  title={next ? `Scheduled tasks · next ${when(next)}` : 'Scheduled tasks'}
>
  {#snippet button()}<CalendarClock size={17} />{#if next}<span class="header-tool-value"
        >{when(next)}</span
      >{/if}{/snippet}
  <div class="popover-body">
    {#if list?.length}
      <TaskList
        {list}
        edit={(task) => {
          open = false;
          editing = { task };
        }}
        changed={(problem) => {
          error = problem ?? '';
          void load();
        }}
      />
    {:else}<p class="popover-empty">
        Nothing yet. Schedule a prompt to run here later or on repeat, or ask the model to.
      </p>{/if}
    {#if error}<p class="popover-empty failed" role="alert">{error}</p>{/if}
  </div>
  <div class="popover-foot">
    <button type="button" onclick={schedule}><Plus size={14} />Schedule a task</button>
    <a href={resolve('/settings?tab=scheduled')} onclick={() => (open = false)}
      ><List size={14} />All tasks</a
    >
  </div>
</HeaderPopover>
{#if editing}<TaskDialog
    chatId={session.id}
    {...editing.task ? { task: editing.task } : {}}
    close={(saved) => {
      editing = undefined;
      if (saved) void load();
    }}
  />{/if}
