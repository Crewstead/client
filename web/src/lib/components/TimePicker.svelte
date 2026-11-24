<script lang="ts">
  import { Clock } from '@lucide/svelte';
  import Dropdown from './Dropdown.svelte';
  import '@crewstead/ui/option-picker.css';
  import '@crewstead/ui/time-date-picker.css';
  let {
    value = $bindable(),
    label,
    disabled = false,
  }: {
    /** "HH:MM", 24-hour. */
    value: string;
    label: string;
    disabled?: boolean;
  } = $props();
  const pad = (n: number) => String(n).padStart(2, '0');
  const hour = $derived(Number(value.slice(0, 2)) || 0);
  const minute = $derived(Number(value.slice(3, 5)) || 0);
  /** In this browser's way of writing times: "9:00 PM" or "21:00". */
  const show = (h: number, m: number) =>
    new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  const hourName = (h: number) =>
    new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });
  const hours = Array.from({ length: 24 }, (_, h) => h);
  // Every five minutes, and the one set when it is in between.
  const minutes = $derived(
    [...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), minute])].sort((a, b) => a - b),
  );
</script>

<!-- A time from two columns, hours and minutes; picking a minute closes it. -->
<Dropdown
  class="option-picker"
  wide
  panelClass="time-columns"
  label={`${label}: ${show(hour, minute)}`}
  {disabled}
  opened={(panel) =>
    panel
      .querySelectorAll('[aria-selected="true"]')
      .forEach((entry) => entry.scrollIntoView({ block: 'center' }))}
>
  {#snippet trigger()}{show(hour, minute)}<Clock size={14} />{/snippet}
  {#snippet children(close)}
    <div class="time-column" role="listbox" aria-label="Hour">
      {#each hours as h (h)}
        <button
          type="button"
          role="option"
          aria-selected={h === hour}
          onclick={() => (value = `${pad(h)}:${pad(minute)}`)}>{hourName(h)}</button
        >
      {/each}
    </div>
    <div class="time-column" role="listbox" aria-label="Minute">
      {#each minutes as m (m)}
        <button
          type="button"
          role="option"
          aria-selected={m === minute}
          onclick={() => {
            value = `${pad(hour)}:${pad(m)}`;
            close(true);
          }}>:{pad(m)}</button
        >
      {/each}
    </div>
  {/snippet}
</Dropdown>
