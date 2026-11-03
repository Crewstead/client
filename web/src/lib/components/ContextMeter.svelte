<script lang="ts">
  import { compact, percent } from './chat-stats.ts';
  /** Same default and share the hub uses for automatic summaries. */
  const DEFAULT_WINDOW = 128_000;
  const SUMMARY_SHARE = 0.8;
  let {
    used,
    window: size = DEFAULT_WINDOW,
    total,
    details,
  }: { used: number; window?: number; total?: number; details?: () => void } = $props();
  const share = $derived(Math.min(1, used / size));
  const shown = $derived(percent(used, size));
  const id = $props.id();
  // The ring: radius 6 in a 16-pixel box.
  const length = 2 * Math.PI * 6;
</script>

<!-- How full the model's context is. Hover or focus shows the details; a click opens the statistics. -->
<span class="context-meter-wrap">
  <button
    type="button"
    class="context-meter"
    class:high={share >= 0.6}
    aria-label={`Context ${shown} full. Show what fills it`}
    aria-describedby={`${id}-card`}
    onclick={() => details?.()}
  >
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" class="track" />
      <circle
        cx="8"
        cy="8"
        r="6"
        class="fill"
        stroke-dasharray={`${share * length} ${length}`}
        transform="rotate(-90 8 8)"
      />
    </svg><span>{shown}</span>
  </button>
  <span class="context-card" id={`${id}-card`} role="tooltip">
    <strong>Context {shown} full</strong>
    <span class="context-bar" aria-hidden="true"
      ><i style:width={`${share * 100}%`}></i><b style:left={`${SUMMARY_SHARE * 100}%`}></b></span
    >
    <span class="context-row"><span>Used by the last reply</span><span>{compact(used)}</span></span>
    <span class="context-row"><span>Model’s window</span><span>{compact(size)}</span></span>
    <span class="context-row"
      ><span>Summarizes itself at</span><span>{compact(Math.round(size * SUMMARY_SHARE))}</span
      ></span
    >
    {#if total}<span class="context-row"
        ><span>Tokens in this chat</span><span>{compact(total)}</span></span
      >{/if}
    <small>Send /compact to summarize now. Click to see what fills it.</small>
  </span>
</span>
