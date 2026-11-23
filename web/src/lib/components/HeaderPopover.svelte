<script lang="ts">
  import type { Snippet } from 'svelte';
  import '@crewstead/ui/header-popover.css';
  let {
    label,
    title,
    button,
    children,
    open = $bindable(false),
    wide = false,
  }: {
    /** What the button opens, for screen readers and its tooltip. */
    label: string;
    title?: string;
    /** The button's face: an icon, and a short value beside it. */
    button: Snippet;
    children: Snippet;
    open?: boolean;
    /** Room for rows with several actions (scheduled tasks). */
    wide?: boolean;
  } = $props();
  let box = $state<HTMLElement>();
</script>

<svelte:window
  onpointerdown={(event) => {
    if (open && event.target instanceof Node && !box?.contains(event.target)) open = false;
  }}
  onkeydown={(event) => {
    if (open && event.key === 'Escape' && !document.querySelector('dialog[open]')) open = false;
  }}
/>
<!-- A chat header's button with its own small panel underneath (a sheet on phones). -->
<span class="header-popover" bind:this={box}>
  <button
    type="button"
    class="icon-button header-tool"
    class:active={open}
    aria-label={label}
    title={title ?? label}
    aria-expanded={open}
    aria-haspopup="dialog"
    onclick={() => (open = !open)}>{@render button()}</button
  >
  {#if open}<div class="header-popover-panel" class:wide role="dialog" aria-label={label}>
      {@render children()}
    </div>{/if}
</span>
