<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ChevronRight, ListChecks } from '@lucide/svelte';
  import type { TimelineItem } from '@crewstead/core/protocol';
  import ToolLine from '#lib/components/ToolLine.svelte';
  import '@crewstead/ui/plan-make.css';
  let { item }: { item: TimelineItem } = $props();

  // The hub's progress: finished steps, one per line, then what the run is doing now after this mark
  // (server make-tool.ts, NOW).
  const NOW = '→ ';
  const lines = $derived((item.progress ?? '').split('\n').filter(Boolean));
  const now = $derived(
    lines.at(-1)?.startsWith(NOW) ? lines.at(-1)!.slice(NOW.length) : 'Working on the plan',
  );
  const done = $derived(lines.filter((line) => !line.startsWith(NOW)));

  let clock = $state(Date.now());
  const timer = setInterval(() => (clock = Date.now()), 1_000);
  onDestroy(() => clearInterval(timer));
  const elapsed = $derived.by(() => {
    const seconds = Math.max(0, Math.floor((clock - Date.parse(item.createdAt)) / 1_000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });
</script>

<!-- While a plan is being made: what it is doing now, how long it has run, and what is finished. -->
{#if item.status === 'pending'}
  <article class="tool-card plan-make" data-status="pending" aria-label="Making a plan">
    <header>
      <ListChecks size={17} /><strong>Planning</strong><span class="tool-status">{elapsed}</span>
    </header>
    <p class="plan-make-now" role="status"><span class="plan-make-pulse"></span>{now}</p>
    {#if done.length}<details class="plan-make-steps">
        <summary><ChevronRight size={13} />{done.length} done</summary>
        <ul>
          {#each done as line, index (index)}<li>{line}</li>{/each}
        </ul>
      </details>{/if}
  </article>
{:else}<ToolLine {item} />{/if}
