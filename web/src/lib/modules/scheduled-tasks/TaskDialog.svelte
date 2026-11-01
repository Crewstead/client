<script lang="ts">
  import type { ScheduledTask, TaskSchedule } from '@crewstead/core/protocol';
  import { browserZone, tasks } from './api.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/skills.css';
  import '@crewstead/ui/scheduled-tasks.css';
  let {
    chatId,
    task,
    close,
  }: {
    chatId: string;
    /** The task to change; a new one when absent. */
    task?: ScheduledTask;
    /** Called when the dialog closes; `saved` after a change was saved. */
    close: (saved: boolean) => void;
  } = $props();
  const id = $props.id();
  type Repeat = 'once' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'hours';
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad = (n: number) => String(n).padStart(2, '0');
  // A new task starts at the next full hour, today or tomorrow.
  const soon = new Date(Date.now() + 3_600_000);
  const today = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`;
  const initial = () => {
    const schedule = task?.schedule;
    const weekdays = schedule?.repeat === 'weekly' && schedule.days.join() === '1,2,3,4,5';
    return {
      title: task?.title ?? '',
      prompt: task?.prompt ?? '',
      repeat: (weekdays ? 'weekdays' : (schedule?.repeat ?? 'daily')) as Repeat,
      date: schedule?.repeat === 'once' ? schedule.at.slice(0, 10) : today,
      time:
        schedule && 'time' in schedule
          ? schedule.time
          : schedule?.repeat === 'once'
            ? schedule.at.slice(11)
            : `${pad(soon.getHours())}:00`,
      days: schedule?.repeat === 'weekly' ? [...schedule.days] : [soon.getDay()],
      day: schedule?.repeat === 'monthly' ? schedule.day : soon.getDate(),
      every: schedule?.repeat === 'hours' ? schedule.every : 1,
    };
  };
  let form = $state(initial());
  let busy = $state(false);
  let error = $state('');
  let saved = false;

  function schedule(): TaskSchedule {
    const { repeat, time } = form;
    if (repeat === 'once') return { repeat, at: `${form.date}T${time}` };
    if (repeat === 'weekdays') return { repeat: 'weekly', days: [1, 2, 3, 4, 5], time };
    if (repeat === 'weekly') return { repeat, days: [...form.days].sort(), time };
    if (repeat === 'monthly') return { repeat, day: form.day, time };
    if (repeat === 'hours') return { repeat, every: form.every };
    return { repeat, time };
  }
  function toggleDay(day: number) {
    form.days = form.days.includes(day)
      ? form.days.filter((other) => other !== day)
      : [...form.days, day];
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (form.repeat === 'weekly' && !form.days.length) return void (error = 'Choose a day.');
    busy = true;
    error = '';
    const fields = {
      title: form.title,
      prompt: form.prompt,
      schedule: schedule(),
      timeZone: browserZone(),
    };
    try {
      if (task) await tasks.update(task.id, fields);
      else await tasks.create(chatId, fields);
      saved = true;
      (event.target as HTMLElement).closest('dialog')?.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not save the task.';
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  class="dialog-content task-dialog"
  aria-labelledby={`${id}-title`}
  {@attach (node) => node.showModal()}
  onclose={() => close(saved)}
>
  <form onsubmit={submit}>
    <h2 id={`${id}-title`} class="dialog-title">{task ? 'Edit task' : 'Schedule a task'}</h2>
    <p class="dialog-description">
      At its time the prompt is sent to this chat as your message, and the model answers it.
    </p>
    <label class="skill-field"
      >Name
      <input
        bind:value={form.title}
        required
        maxlength="80"
        placeholder="Morning news"
        disabled={busy}
      />
    </label>
    <label class="skill-field"
      >Prompt
      <textarea
        bind:value={form.prompt}
        required
        rows="4"
        maxlength="4000"
        placeholder="Summarize today’s top tech news in five bullet points."
        disabled={busy}></textarea>
    </label>
    <div class="task-when">
      <label class="skill-field"
        >Repeat
        <select bind:value={form.repeat} disabled={busy}>
          <option value="once">Once</option>
          <option value="daily">Every day</option>
          <option value="weekdays">Every weekday</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="hours">Every few hours</option>
        </select>
      </label>
      {#if form.repeat === 'once'}
        <label class="skill-field"
          >Date <input type="date" bind:value={form.date} required min={today} disabled={busy} />
        </label>
      {:else if form.repeat === 'monthly'}
        <label class="skill-field"
          >Day
          <input type="number" bind:value={form.day} min="1" max="31" required disabled={busy} />
        </label>
      {:else if form.repeat === 'hours'}
        <label class="skill-field"
          >Every (hours)
          <input type="number" bind:value={form.every} min="1" max="24" required disabled={busy} />
        </label>
      {/if}
      {#if form.repeat !== 'hours'}
        <label class="skill-field"
          >Time <input type="time" bind:value={form.time} required disabled={busy} />
        </label>
      {/if}
    </div>
    {#if form.repeat === 'weekly'}
      <div class="task-days" role="group" aria-label="Days">
        {#each DAYS as name, day (name)}
          <button
            type="button"
            class="task-day"
            aria-pressed={form.days.includes(day)}
            disabled={busy}
            onclick={() => toggleDay(day)}>{name}</button
          >
        {/each}
      </div>
    {/if}
    <p class="task-zone">Times are in {browserZone()}.</p>
    {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
    <div class="dialog-actions">
      <button
        type="button"
        class="button subtle"
        disabled={busy}
        onclick={(event) => event.currentTarget.closest('dialog')?.close()}>Cancel</button
      >
      <button type="submit" class="button primary" disabled={busy}
        >{busy ? 'Saving…' : task ? 'Save' : 'Schedule'}</button
      >
    </div>
  </form>
</dialog>
