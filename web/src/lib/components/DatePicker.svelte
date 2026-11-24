<script lang="ts">
  import { CalendarDays, ChevronLeft, ChevronRight } from '@lucide/svelte';
  import Dropdown from './Dropdown.svelte';
  import '@crewstead/ui/option-picker.css';
  import '@crewstead/ui/time-date-picker.css';
  let {
    value = $bindable(),
    label,
    min,
    disabled = false,
  }: {
    /** "YYYY-MM-DD". */
    value: string;
    label: string;
    /** The earliest day that may be picked, "YYYY-MM-DD". */
    min?: string;
    disabled?: boolean;
  } = $props();
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (text: string) => {
    const [y, m, d] = text.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
  };
  const today = iso(new Date());
  const shown = $derived(
    parse(value).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
  );
  /** The month on screen: the chosen day's, moved by the arrows. */
  let month = $state(parse(value));
  const title = $derived(month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  // Weeks start on Monday; the names in this browser's language.
  const names = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }),
  );
  const days = $derived.by(() => {
    const year = month.getFullYear();
    const index = month.getMonth();
    const offset = (new Date(year, index, 1).getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(year, index, 1 - offset + i);
      return { key: iso(day), date: day.getDate(), inMonth: day.getMonth() === index };
    });
  });
  const step = (by: number) => (month = new Date(month.getFullYear(), month.getMonth() + by, 1));
</script>

<!-- A day from a month's calendar; the arrows go to other months. -->
<Dropdown
  class="option-picker"
  wide
  panelClass="date-calendar"
  label={`${label}: ${shown}`}
  {disabled}
  opened={() => (month = parse(value))}
>
  {#snippet trigger()}{shown}<CalendarDays size={14} />{/snippet}
  {#snippet children(close)}
    <div class="date-head">
      <button type="button" class="icon-button" aria-label="Previous month" onclick={() => step(-1)}
        ><ChevronLeft size={15} /></button
      ><span>{title}</span><button
        type="button"
        class="icon-button"
        aria-label="Next month"
        onclick={() => step(1)}><ChevronRight size={15} /></button
      >
    </div>
    <div class="date-grid" role="grid" aria-label={title}>
      {#each names as name, index (index)}<span class="date-name">{name}</span>{/each}
      {#each days as day (day.key)}
        <button
          type="button"
          class:outside={!day.inMonth}
          class:today={day.key === today}
          aria-pressed={day.key === value}
          aria-label={parse(day.key).toLocaleDateString(undefined, { dateStyle: 'full' })}
          disabled={!!min && day.key < min}
          onclick={() => {
            value = day.key;
            close(true);
          }}>{day.date}</button
        >
      {/each}
    </div>
  {/snippet}
</Dropdown>
