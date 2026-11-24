<script lang="ts">
  import type { Snippet } from 'svelte';
  import { keepInView } from '#lib/keep-in-view.ts';
  import '@crewstead/ui/dropdown.css';
  let {
    label,
    title,
    disabled = false,
    open = $bindable(false),
    class: className = '',
    triggerClass = '',
    panelClass = '',
    align = 'start',
    up = false,
    wide = false,
    role,
    panelLabel,
    trigger,
    children,
    opened,
    pressed,
  }: {
    /** The trigger's accessible name (and its tooltip, unless `title` says otherwise). */
    label: string;
    title?: string;
    disabled?: boolean;
    open?: boolean;
    /** Classes for the whole dropdown, which keep each one's own trigger look. */
    class?: string;
    triggerClass?: string;
    panelClass?: string;
    /** Which edge of the trigger the panel lines up with. */
    align?: 'start' | 'end';
    /** Opens above the trigger (the prompt box's pickers); otherwise below, unless short of room. */
    up?: boolean;
    /** Fills its field's width, as in forms. */
    wide?: boolean;
    /** The panel's role, e.g. "menu" or "dialog", and its name (a dialog's, e.g. "Skills in this chat"). */
    role?: string;
    panelLabel?: string;
    trigger: Snippet;
    /** The panel's content; `close` shuts it (and returns focus to the trigger). */
    children: Snippet<[close: (focus?: boolean) => void]>;
    /** After opening, e.g. to scroll a list to its chosen entry. */
    opened?: (panel: HTMLElement) => void;
    /** A trigger press that opens something else instead (return true), e.g. a sheet on touch. */
    pressed?: (event: MouseEvent) => boolean;
  } = $props();
  let details = $state<HTMLDetailsElement>();
  let summary = $state<HTMLElement>();
  function close(focus = false) {
    if (!open) return;
    open = false;
    if (focus) summary?.focus();
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (open && event.target instanceof Node && !details?.contains(event.target)) close();
  }}
  onkeydown={(event) => {
    // A dialog opened from inside closes first (its own Escape).
    if (open && event.key === 'Escape' && !details?.querySelector('dialog[open]')) close(true);
  }}
/>
<!-- The one dropdown: a trigger and the panel it opens; every menu and picker is built on it. -->
<details
  class="dropdown {className}"
  class:wide
  bind:open
  bind:this={details}
  use:keepInView={'.dropdown-panel'}
  ontoggle={() => {
    const panel = details?.querySelector<HTMLElement>('.dropdown-panel');
    if (open && panel) opened?.(panel);
  }}
>
  <summary
    bind:this={summary}
    class={triggerClass}
    aria-label={label}
    title={title ?? label}
    aria-disabled={disabled || undefined}
    tabindex={disabled ? -1 : 0}
    onclick={(event) => {
      if (disabled || pressed?.(event)) event.preventDefault();
    }}>{@render trigger()}</summary
  >
  <div
    class="dropdown-panel {panelClass}"
    class:end={align === 'end'}
    class:up
    {role}
    aria-label={panelLabel}
  >
    {@render children(close)}
  </div>
</details>
