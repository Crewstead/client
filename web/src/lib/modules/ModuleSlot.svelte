<script lang="ts" generics="Slot extends SlotName">
  import type { Component, Snippet } from 'svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { activeModules, panelsFor } from './registry.ts';
  import type { SlotName, SlotProps } from './types.ts';
  let {
    slot,
    props,
    pending,
  }: {
    slot: Slot;
    props: SlotProps[Slot];
    /** Shown in a panel's place while its code loads, so the page keeps its shape. */
    pending?: Snippet;
  } = $props();
  const workspace = useWorkspace();
  const panels = $derived(panelsFor(activeModules(workspace.catalog?.modules), slot));
</script>

<!-- Renders the panels running modules contribute to this slot, each loaded on first use. -->
{#each panels as panel (panel)}
  {#await panel.load()}
    {@render pending?.()}
  {:then loaded}
    {@const Panel = loaded.default as Component<SlotProps[Slot]>}
    <Panel {...props} />
  {/await}
{/each}
