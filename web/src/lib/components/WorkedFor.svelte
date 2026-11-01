<script lang="ts">
  import { onMount } from 'svelte';
  import { duration } from './duration.ts';
  /**
   * A finished turn's time, or `since` for a clock that runs while the reply is working; `speed` is
   * how fast the model wrote, in output tokens per second.
   */
  let { ms, since, speed }: { ms?: number; since?: string; speed?: number } = $props();
  let now = $state(Date.now());
  onMount(() => {
    if (!since) return;
    const timer = setInterval(() => (now = Date.now()), 1_000);
    return () => clearInterval(timer);
  });
  // Replies under a second say nothing. Clocks on another device may differ a little from the hub's; never show negative time.
  const elapsed = $derived(since ? Math.max(0, now - Date.parse(since)) : (ms ?? 0));
</script>

{#if since}<p
    class="worked worked-live"
    role="status"
    aria-label={`Working for ${duration(elapsed)}`}
  >
    <span class="working-dot" aria-hidden="true"></span><span>Working · {duration(elapsed)}</span>
  </p>{:else if elapsed >= 1_000}<p class="worked">
    Worked for {duration(elapsed)}{#if speed}<span
        title="How fast the model wrote its reply, in output tokens per second"
        >{` · ${speed} tok/s`}</span
      >{/if}
  </p>{/if}
