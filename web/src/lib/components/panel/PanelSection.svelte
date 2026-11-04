<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import { Plus } from '@lucide/svelte';
  let {
    label,
    title = label,
    icon: Icon,
    count,
    empty = false,
    add,
    children,
  }: {
    /** Names the section, kept for callers; tabs replaced folding, so nothing is stored. */
    id?: string;
    /** Its accessible name, e.g. "Files changed in this chat". */
    label: string;
    /** Its heading, e.g. "Changed files". */
    title?: string;
    icon: Component<{ size?: number }>;
    /** Shown on the right of the heading, e.g. "3" or "2 open". */
    count?: string | number | undefined;
    /** Nothing to show: the section stays out of its tab, unless it offers `add`. */
    empty?: boolean;
    /** Its main action as a + in the heading, e.g. "Add skill". */
    add?: { label: string; run: () => void };
    children: Snippet;
  } = $props();
</script>

<!-- One part of a details tab: a heading with its count and action, then what it holds. -->
{#if !empty || add}
  <section class="panel-section" class:empty aria-label={label}>
    <h3>
      <Icon size={13} /><span class="panel-title">{title}</span>{#if count}<span class="panel-count"
          >{count}</span
        >{/if}{#if add}<button
          type="button"
          class="icon-button panel-add"
          aria-label={add.label}
          title={add.label}
          onclick={add.run}><Plus size={14} /></button
        >{/if}
    </h3>
    {@render children()}
  </section>
{/if}
