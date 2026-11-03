<script lang="ts">
  import type { PlanLimits } from '@crewstead/core/protocol';
  import { ago, shownWindows, tightest } from './plan-usage.ts';
  import '@crewstead/ui/plan-meter.css';
  let { limits, plan }: { limits: PlanLimits; /** "Claude", "ChatGPT". */ plan: string } = $props();
  // Resets pass while the page is open: the figures follow the clock.
  let now = $state(new Date());
  $effect(() => {
    const timer = setInterval(() => (now = new Date()), 30_000);
    return () => clearInterval(timer);
  });
  const windows = $derived(shownWindows(limits, now));
  const top = $derived(tightest(windows)!);
  // The two bars of the button: the short window above, the weekly one below.
  const bars = $derived(windows.slice(0, 2));
  let open = $state(false);
  const id = $props.id();
</script>

<!--
  How much of the plan's usage limits is used, beside the context meter. Hover or focus shows each
  window and when it resets; a tap keeps it open on a touch screen.
-->
<span
  class="plan-meter-wrap"
  class:open
  onfocusout={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false;
  }}
>
  <button
    type="button"
    class="plan-meter {top.level}"
    aria-label={`${plan} usage: ${top.label} ${top.used}% used. Show limits`}
    aria-describedby={`${id}-card`}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="plan-bars" aria-hidden="true"
      >{#each bars as bar (bar.label)}<i class={bar.level}
          ><b style:width={`${Math.min(bar.used, 100)}%`}></b></i
        >{/each}</span
    ><span>{top.level === 'full' && !top.reset ? 'Limit' : `${top.used}%`}</span>
  </button>
  <span class="plan-card" id={`${id}-card`} role="tooltip">
    <strong>{plan} plan usage</strong>
    {#each windows as window (window.label)}
      <span class="plan-window {window.level}">
        <span class="plan-row"
          ><span>{window.label}</span><span
            >{window.level === 'full' && !window.reset
              ? 'Limit reached'
              : `${window.used}% used`}</span
          ></span
        >
        <span class="plan-bar" aria-hidden="true"
          ><i style:width={`${Math.min(window.used, 100)}%`}></i></span
        >
        {#if window.resets}<small>{window.resets}</small>{/if}
      </span>
    {/each}
    <small class="plan-note">As of the last reply, {ago(limits.checkedAt, now)}.</small>
  </span>
</span>
