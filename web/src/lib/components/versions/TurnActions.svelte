<script lang="ts">
  import { GitBranch, RotateCcw } from '@lucide/svelte';
  import CopyButton from './CopyButton.svelte';
  import type { ChatActions } from './chat-actions.ts';
  let {
    text,
    lastId,
    actions,
  }: {
    /** The turn's answer: its replies' text, without tool calls. */
    text: string;
    /** The turn's last item, which a retry and a fork go from. */
    lastId: string;
    actions: ChatActions;
  } = $props();
</script>

<!-- Under an answer: copy it, write it again, or go on from it in a new chat. -->
<span class="message-action-buttons">
  {#if text}<CopyButton {text} label="Copy response" />{/if}
  <button
    class="icon-button"
    aria-label="Regenerate response"
    title="Regenerate response"
    disabled={actions.disabled}
    onclick={() => actions.again(lastId)}><RotateCcw size={14} /></button
  >
  <button
    class="icon-button"
    aria-label="Fork chat from here"
    title="Fork: a new chat from here"
    onclick={() => actions.fork(lastId)}><GitBranch size={14} /></button
  >
</span>
