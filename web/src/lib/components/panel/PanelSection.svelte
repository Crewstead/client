<script lang="ts">
  import '@crewstead/ui/panel-chips.css';
  import type { Component, Snippet } from 'svelte';
  import { ChevronRight, Plus } from '@lucide/svelte';
  let {
    id,
    label,
    title = label,
    icon: Icon,
    count,
    empty = false,
    add,
    children,
  }: {
    /** Names the section where its folded or unfolded state is remembered. */
    id: string;
    /** Its accessible name, e.g. "Files changed in this chat". */
    label: string;
    /** Its heading, e.g. "Changed files". */
    title?: string;
    icon: Component<{ size?: number }>;
    /** Shown on the right of the heading, e.g. "3" or "2 open". */
    count?: string | number | undefined;
    /** Nothing to show yet: folded to its heading unless the owner opened it. */
    empty?: boolean;
    /** Its main action as a + in the heading, there even while folded, e.g. "Add skill". */
    add?: { label: string; run: () => void };
    children: Snippet;
  } = $props();
  const key = $derived(`crewstead-panel-${id}`);
  /** The owner's own choice for this section, if they made one; browser storage may be off. */
  function remembered(): boolean | undefined {
    try {
      const value = localStorage.getItem(key);
      return value === null ? undefined : value === 'open';
    } catch {
      return undefined;
    }
  }
  let chosen = $state(remembered());
  const open = $derived(chosen ?? !empty);
  function toggle() {
    chosen = !open;
    try {
      localStorage.setItem(key, chosen ? 'open' : 'closed');
    } catch {
      // Not remembered this time.
    }
  }
  const bodyId = $props.id();
</script>

<!-- One part of the details panel: a heading that folds it away, and what it holds. -->
<!-- Folded with nothing in it, it shrinks to a chip in the row at the panel's end. -->
<section
  class="panel-section"
  class:folded={!open}
  class:empty
  class:chip={!open && empty}
  aria-label={label}
>
  <h3>
    <button type="button" aria-expanded={open} aria-controls={bodyId} onclick={toggle}
      ><ChevronRight size={13} class="panel-chevron" /><Icon size={13} />{title}{#if count}<span
          >{count}</span
        >{:else if empty}<span>None</span>{/if}</button
    >{#if add}<button
        type="button"
        class="icon-button panel-add"
        aria-label={add.label}
        title={add.label}
        onclick={add.run}><Plus size={14} /></button
      >{/if}
  </h3>
  {#if open}<div id={bodyId}>{@render children()}</div>{/if}
</section>
