<script lang="ts">
  import { CornerDownRight, Pencil, SendHorizontal, X } from '@lucide/svelte';
  import type { QueuedMessage } from '@crewstead/core/protocol';
  let {
    queued,
    busy,
    remove,
    edit,
    sendNext,
  }: {
    queued: QueuedMessage[];
    /** A reply is running: the model takes them at its next step. */
    busy: boolean;
    remove: (id: string) => void;
    /** Takes the message out of the line and back into the box. */
    edit: (message: QueuedMessage) => void;
    sendNext: () => void;
  } = $props();
</script>

<!-- Messages sent while a reply runs: the model takes them at its next step, or they go when it ends. -->
<section class="queued" aria-label="Waiting messages">
  <header>
    <span
      title={busy
        ? 'The model reads them after its current step; ones that change the model or place, or have files, go when the reply ends.'
        : undefined}>{busy ? 'Sent at the model’s next step' : 'Waiting: the reply stopped'}</span
    >
    {#if !busy}<button class="button subtle small" onclick={sendNext}
        ><SendHorizontal size={13} /> Send now</button
      >{/if}
  </header>
  <ol>
    {#each queued as message (message.id)}
      <li>
        <CornerDownRight size={13} aria-hidden="true" />
        <span class="queued-text" title={message.text}
          >{message.text ||
            `${message.attachments?.length ?? 0} file${message.attachments?.length === 1 ? '' : 's'}`}</span
        >
        <button
          class="icon-button"
          aria-label="Edit waiting message"
          title="Edit: back into the box"
          onclick={() => edit(message)}><Pencil size={13} /></button
        >
        <button
          class="icon-button"
          aria-label="Remove waiting message"
          title="Remove"
          onclick={() => remove(message.id)}><X size={14} /></button
        >
      </li>
    {/each}
  </ol>
</section>
