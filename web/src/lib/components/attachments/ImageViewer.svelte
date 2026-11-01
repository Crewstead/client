<script lang="ts">
  import '@crewstead/ui/attachments.css';
  import { Download, X } from '@lucide/svelte';
  import type { Attachment } from '@crewstead/core/protocol';
  import { attachmentUrl } from '#lib/attachments.ts';
  let { image, close }: { image: Attachment; close: () => void } = $props();
  /** Saves the picture under its own name; it is already on this page as a local address. */
  function save(url: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = image.name;
    link.click();
  }
</script>

<!-- A picture at full size. Esc, the close button or a click outside it closes the viewer. -->
<dialog
  class="image-viewer"
  aria-label={image.name}
  {@attach (node) => node.showModal()}
  onclose={close}
  onclick={(event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  }}
>
  {#await attachmentUrl(image.id) then url}
    <header>
      <span class="image-viewer-name">{image.name}</span>
      <button class="icon-button" aria-label="Download" onclick={() => save(url)}
        ><Download size={16} /></button
      >
      <button
        class="icon-button"
        aria-label="Close"
        onclick={(event) => event.currentTarget.closest('dialog')?.close()}><X size={16} /></button
      >
    </header>
    <img src={url} alt={image.name} />
  {/await}
</dialog>
