<script lang="ts">
  import type { Component } from 'svelte';
  import type { TimelineItem } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { activeModules, toolViewFor } from '#lib/modules/registry.ts';
  import ToolItem from './ToolItem.svelte';
  let {
    item,
    decide,
  }: {
    item: TimelineItem;
    decide: (id: string, decision: 'approve' | 'reject' | 'approve-all') => Promise<boolean>;
  } = $props();
  const workspace = useWorkspace();
  const view = $derived(toolViewFor(activeModules(workspace.catalog?.modules), item.toolName));
</script>

<!-- A module's own tool shows the way that module draws it; every other call is a plain tool row. -->
{#if view}
  {#await view()}<ToolItem {item} {decide} />{:then loaded}
    {@const View = loaded.default as Component<{ item: TimelineItem }>}
    <View {item} />
  {/await}
{:else}<ToolItem {item} {decide} />{/if}
