<script lang="ts">
  import type { UsageReport } from '@crewstead/core/protocol';
  import { compact } from '#lib/components/chat-stats.ts';
  import { dayLabel } from './usage.svelte.ts';
  /** Tokens a day stacked by model (or messages a day), with the hovered day's details above. */
  let {
    daily,
    series,
    colour,
    label,
  }: {
    daily: UsageReport['daily'];
    /** Models in the order they stack, the biggest first; others are summed as "Other". */
    series: string[];
    colour: (id: string) => string;
    label: (id: string) => string;
  } = $props();
  let measure = $state<'tokens' | 'messages'>('tokens');
  let hovered = $state<number>();
  const valueOf = (day: UsageReport['daily'][number]) =>
    measure === 'tokens' ? day.tokens : day.messages;
  const top = $derived(Math.max(...daily.map(valueOf), 1));
  const segments = (day: UsageReport['daily'][number]) => {
    if (measure === 'messages')
      return [{ id: 'messages', value: day.messages, colour: 'var(--chart-2)' }];
    const shown = series.map((id) => ({ id, value: day.byModel[id] ?? 0, colour: colour(id) }));
    const other = day.tokens - shown.reduce((sum, part) => sum + part.value, 0);
    return [
      ...shown,
      ...(other > 0 ? [{ id: 'other', value: other, colour: 'var(--chart-7)' }] : []),
    ];
  };
  const focus = $derived(hovered === undefined ? undefined : daily[hovered]);
  const total = $derived(daily.reduce((sum, day) => sum + valueOf(day), 0));
</script>

<section class="usage-card daily-card" aria-label="Day by day">
  <header class="daily-head">
    <h2 class="usage-card-title">Day by day</h2>
    <div class="usage-toggle" role="group" aria-label="Show">
      <button aria-pressed={measure === 'tokens'} onclick={() => (measure = 'tokens')}
        >Tokens</button
      >
      <button aria-pressed={measure === 'messages'} onclick={() => (measure = 'messages')}
        >Messages</button
      >
    </div>
  </header>
  <p class="daily-focus" aria-live="polite">
    {#if focus}
      <strong>{dayLabel(focus.day, 'long')}</strong> · {compact(valueOf(focus))}
      {measure}{#if measure === 'tokens'}{#each segments(focus).filter((part) => part.value) as part (part.id)}<span
            class="daily-part"
            ><i style:background={part.colour}></i>{part.id === 'other' ? 'Other' : label(part.id)}
            {compact(part.value)}</span
          >{/each}{/if}
    {:else}
      <strong>{compact(total)}</strong>
      {measure} over {daily.length}
      {daily.length === 1 ? 'day' : 'days'}
      <span class="daily-hint">· point at a day for details</span>
    {/if}
  </p>
  <div class="daily-chart" class:dense={daily.length > 60}>
    <span class="daily-axis">{compact(top)}</span>
    <div class="daily-bars" role="group" aria-label="Days" onmouseleave={() => (hovered = undefined)}>
      {#each daily as day, index (day.day)}
        <button
          class="daily-bar"
          class:active={hovered === index}
          aria-label={`${dayLabel(day.day, 'long')}: ${compact(valueOf(day))} ${measure}`}
          onmouseenter={() => (hovered = index)}
          onfocus={() => (hovered = index)}
        >
          <span class="daily-stack" style:height={`${(valueOf(day) / top) * 100}%`}>
            {#each segments(day) as part (part.id)}<i
                style:flex-grow={part.value}
                style:background={part.colour}
              ></i>{/each}
          </span>
        </button>
      {/each}
    </div>
  </div>
  <div class="daily-dates">
    <span>{dayLabel(daily[0]?.day ?? '')}</span><span>{dayLabel(daily.at(-1)?.day ?? '')}</span>
  </div>
  {#if measure === 'tokens' && series.length}
    <ul class="daily-legend">
      {#each series as id (id)}<li><i style:background={colour(id)}></i>{label(id)}</li>{/each}
    </ul>
  {/if}
</section>
