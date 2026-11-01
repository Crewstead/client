<script lang="ts">
  import '@crewstead/ui/attachments.css';
  import { FileText } from '@lucide/svelte';
  import { isImage, type Attachment } from '@crewstead/core/protocol';
  import { attachmentUrl, formatSize } from '#lib/attachments.ts';
  import ImageViewer from './ImageViewer.svelte';
  let { files, align = 'start' }: { files: Attachment[]; align?: 'start' | 'end' } = $props();
  const images = $derived(files.filter(isImage));
  const others = $derived(files.filter((file) => !isImage(file)));
  let viewing = $state<Attachment>();
  /** Text files open in a new tab, as plain text. */
  async function open(file: Attachment) {
    const tab = window.open('', '_blank');
    try {
      if (tab) tab.location.href = await attachmentUrl(file.id);
    } catch {
      tab?.close();
    }
  }
</script>

<div class="attachments" data-align={align}>
  {#if images.length}<div class="attachment-images">
      {#each images as image (image.id)}
        <button
          type="button"
          class="attachment-image"
          title={image.name}
          onclick={() => (viewing = image)}
        >
          {#await attachmentUrl(image.id)}<span class="attachment-placeholder"></span>
          {:then url}<img src={url} alt={image.name} />
          {:catch}<span class="attachment-placeholder missing">Not available</span>
          {/await}
        </button>
      {/each}
    </div>{/if}
  {#each others as file (file.id)}
    <button type="button" class="attachment-chip file" onclick={() => open(file)}>
      <span class="attachment-icon"><FileText size={16} /></span>
      <span class="attachment-text">
        <span class="attachment-name" title={file.name}>{file.name}</span>
        <span class="attachment-note">{formatSize(file.size)}</span>
      </span>
    </button>
  {/each}
</div>
{#if viewing}<ImageViewer image={viewing} close={() => (viewing = undefined)} />{/if}
