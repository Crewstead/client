<script lang="ts">
  import '@crewstead/ui/walkthrough.css';
  import { BookOpen } from '@lucide/svelte';
  import { walkthroughOf, type TimelineItem } from '@crewstead/core/protocol';
  let { item }: { item: TimelineItem } = $props();
  let open = $state(false);
  // The call's own text, not the item it came in: a long walkthrough is read only when opened.
  const raw = $derived(item.arguments);
  const data = $derived(open ? walkthroughOf(raw) : undefined);
  const waiting = $derived(item.status === 'streaming' || item.status === 'pending');
</script>

<!-- A walkthrough the model sent: a card that opens it, or why it was not shown. -->
{#if item.status === 'completed'}
  <article class="walk-card">
    <BookOpen size={18} />
    <div class="walk-card-text"><strong>{item.text}</strong><span>Walkthrough</span></div>
    <button class="button subtle small" onclick={() => (open = true)}>Open</button>
  </article>
  {#if open && data}
    {#await import('./WalkViewer.svelte') then loaded}
      {@const Viewer = loaded.default}
      <Viewer {data} store="walk:{item.id}" close={() => (open = false)} />
    {/await}
  {:else if open}
    <p class="error-banner">This walkthrough cannot be read.</p>
  {/if}
{:else}
  <article class="tool-card" data-status={item.status}>
    <header>
      <BookOpen size={16} /><strong>Walkthrough</strong>
      <!-- A call that could not be read has its raw arguments for a text; they say nothing here. -->
      <span class="walk-card-name">{item.text.startsWith('{') ? '' : item.text}</span>
      <span class="tool-status">{waiting ? 'Checking' : 'Not shown'}</span>
    </header>
    {#if item.status === 'failed' && item.result}
      <details class="walk-card-problems">
        <summary>What the check found</summary>
        <pre>{item.result}</pre>
      </details>
    {/if}
  </article>
{/if}
