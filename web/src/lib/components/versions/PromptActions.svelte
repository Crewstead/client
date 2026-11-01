<script lang="ts">
  import { Pencil, RotateCcw } from '@lucide/svelte';
  import type { TimelineItem } from '@crewstead/core/protocol';
  import CopyButton from './CopyButton.svelte';
  import VersionSwitch from './VersionSwitch.svelte';
  import type { ChatActions, Versions } from './chat-actions.ts';
  let {
    item,
    versions,
    actions,
    edit,
  }: { item: TimelineItem; versions?: Versions; actions: ChatActions; edit: () => void } = $props();
</script>

<!-- Under a prompt: copy, edit or retry it (on hover), then its versions at the bubble's edge. -->
<div class="message-actions prompt-actions" class:has-versions={!!versions}>
  <span class="message-action-buttons">
    {#if item.text}<CopyButton text={item.text} label="Copy prompt" />{/if}
    <button
      class="icon-button"
      aria-label="Edit prompt"
      title="Edit prompt"
      disabled={actions.disabled}
      onclick={edit}><Pencil size={14} /></button
    >
    <button
      class="icon-button"
      aria-label="Retry prompt"
      title="Retry prompt"
      disabled={actions.disabled}
      onclick={() => actions.again(item.id)}><RotateCcw size={14} /></button
    >
  </span>
  {#if versions}<VersionSwitch {versions} {actions} />{/if}
</div>
