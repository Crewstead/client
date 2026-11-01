<script lang="ts">
  import '@crewstead/ui/attachments.css';
  import { FileText, LoaderCircle, X, TriangleAlert } from '@lucide/svelte';
  import type { PendingFiles } from '#lib/pending-files.svelte.ts';
  let { pending }: { pending: PendingFiles } = $props();
</script>

<!-- Files waiting to be sent with the next message. -->
<ul class="attachment-tray" aria-label="Attached files">
  {#each pending.files as file (file.key)}
    <li
      class="attachment-chip"
      data-state={file.error ? 'failed' : file.saved ? 'ready' : 'uploading'}
    >
      {#if file.preview}<img src={file.preview} alt="" />{:else}<span class="attachment-icon"
          ><FileText size={16} /></span
        >{/if}
      <span class="attachment-text">
        <span class="attachment-name" title={file.name}>{file.name}</span>
        {#if file.error}<span class="attachment-note" role="alert"
            ><TriangleAlert size={11} /> {file.error}</span
          >{:else if !file.saved}<span class="attachment-note"
            ><LoaderCircle size={11} class="spin" /> Uploading…</span
          >{/if}
      </span>
      <button
        type="button"
        class="attachment-remove"
        aria-label={`Remove ${file.name}`}
        onclick={() => pending.remove(file.key)}><X size={12} /></button
      >
    </li>
  {/each}
</ul>
