<script lang="ts">
  import {
    CalendarClock,
    History,
    MessageSquare,
    Pause,
    Pencil,
    Play,
    Send,
    Trash2,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { describeSchedule, type ScheduledTask } from '@crewstead/core/protocol';
  import { shortTime, tasks } from './api.ts';
  import TaskRuns from './TaskRuns.svelte';
  import '@crewstead/ui/scheduled-tasks.css';
  let {
    list,
    showChat = false,
    edit,
    changed,
  }: {
    list: ScheduledTask[];
    /** Name each task's chat, with a link (the list of all tasks). */
    showChat?: boolean;
    edit: (task: ScheduledTask) => void;
    /** After a change, with what went wrong if anything did. */
    changed: (error?: string) => void;
  } = $props();
  let confirming = $state('');
  let running = $state('');
  let history = $state<ScheduledTask>();
  async function act(action: () => Promise<unknown>) {
    let error: string | undefined;
    try {
      await action();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That did not work.';
    }
    confirming = running = '';
    changed(error);
  }
  /** The narrow panel puts the next run first, so a cut-off line still shows when. */
  function status(task: ScheduledTask) {
    const when = describeSchedule(task.schedule);
    if (task.enabled && task.nextRunAt) {
      const next = shortTime(task.nextRunAt);
      return showChat ? `${when} · next ${next}` : `Next ${next} · ${when}`;
    }
    if (task.schedule.repeat === 'once' && task.lastRunAt)
      return `Ran ${shortTime(task.lastRunAt)}`;
    return when;
  }
</script>

<ul class="task-list" class:task-cards={showChat} aria-label="Scheduled tasks">
  {#each list as task (task.id)}
    <li class="task-row" data-enabled={task.enabled}>
      <span class="task-text">
        <span class="task-title"
          ><span class="task-name">{task.title}</span>{#if !task.enabled}<span class="pill"
              >Paused</span
            >{/if}</span
        >
        <span class="task-meta">
          <span class="task-schedule" title={status(task)}
            ><CalendarClock size={12} /><span class="task-schedule-text">{status(task)}</span></span
          >
          {#if showChat}<a
              class="task-chat"
              title={task.chatTitle}
              href={resolve('/sessions/[id]', { id: task.chatId })}
              ><MessageSquare size={12} /><span class="task-chat-name">{task.chatTitle}</span></a
            >{/if}
        </span>
        {#if showChat}<span class="task-prompt" title={task.prompt}>{task.prompt}</span>{/if}
        {#if task.lastResult && task.lastResult !== 'Sent'}<small class="task-problem"
            >{task.lastResult}</small
          >{/if}
      </span>
      <button
        class="icon-button"
        aria-label={`Run ${task.title} now`}
        title="Run now"
        disabled={running === task.id}
        onclick={() => {
          running = task.id;
          void act(() => tasks.run(task.id));
        }}><Send size={13} /></button
      >
      <button
        class="icon-button"
        aria-label={`${task.enabled ? 'Pause' : 'Resume'} ${task.title}`}
        title={task.enabled ? 'Pause' : 'Resume'}
        onclick={() => act(() => tasks.update(task.id, { enabled: !task.enabled }))}
        >{#if task.enabled}<Pause size={13} />{:else}<Play size={13} />{/if}</button
      >
      <button
        class="icon-button"
        aria-label={`Runs of ${task.title}`}
        title="Runs"
        onclick={() => (history = task)}><History size={13} /></button
      >
      <button
        class="icon-button"
        aria-label={`Edit ${task.title}`}
        title="Edit"
        onclick={() => edit(task)}><Pencil size={13} /></button
      >
      {#if confirming === task.id}<button
          class="button danger small"
          onclick={() => act(() => tasks.remove(task.id))}
          onblur={() => (confirming = '')}
          {@attach (node) => node.focus()}>Delete</button
        >{:else}<button
          class="icon-button"
          aria-label={`Delete ${task.title}`}
          title="Delete"
          onclick={() => (confirming = task.id)}><Trash2 size={13} /></button
        >{/if}
    </li>
  {/each}
</ul>
{#if history}<TaskRuns task={history} close={() => (history = undefined)} />{/if}
