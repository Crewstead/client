<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import OptionPicker from '#lib/components/OptionPicker.svelte';
  import TimePicker from '#lib/components/TimePicker.svelte';
  import DatePicker from '#lib/components/DatePicker.svelte';
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
  const repeats: Array<{ value: Repeat; label: string }> = [
    { value: 'once', label: 'Once' },
    { value: 'daily', label: 'Every day' },
    { value: 'weekdays', label: 'Every weekday' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'hours', label: 'Every few hours' },
  ];
  const monthDays = Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1),
    label: i + 1 > 28 ? `${i + 1} (or the month’s last day)` : String(i + 1),
  }));
  const everyHours = Array.from({ length: 24 }, (_, i) => ({
    value: String(i + 1),
    label: i ? `${i + 1} hours` : 'Hour',
  }));
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
  {@attach closeOutside}
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
      <div class="skill-field">
        <span>Repeat</span>
        <OptionPicker
          wide
          label="Repeat"
          options={repeats}
          disabled={busy}
          bind:value={form.repeat}
        />
      </div>
      {#if form.repeat === 'once'}
        <div class="skill-field">
          <span>Date</span>
          <DatePicker label="Date" min={today} disabled={busy} bind:value={form.date} />
        </div>
      {:else if form.repeat === 'monthly'}
        <div class="skill-field">
          <span>Day</span>
          <OptionPicker
            wide
            label="Day of the month"
            options={monthDays}
            disabled={busy}
            value={String(form.day)}
            onchange={(day) => (form.day = Number(day))}
          />
        </div>
      {:else if form.repeat === 'hours'}
        <div class="skill-field">
          <span>Every</span>
          <OptionPicker
            wide
            label="Every"
            options={everyHours}
            disabled={busy}
            value={String(form.every)}
            onchange={(hours) => (form.every = Number(hours))}
          />
        </div>
      {/if}
      {#if form.repeat !== 'hours'}
        <div class="skill-field">
          <span>Time</span>
          <TimePicker label="Time" disabled={busy} bind:value={form.time} />
        </div>
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
