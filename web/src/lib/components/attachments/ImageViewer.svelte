<script lang="ts">
  import '@crewstead/ui/attachments.css';
  import { Download, X, ZoomIn, ZoomOut } from '@lucide/svelte';
  import type { Attachment } from '@crewstead/core/protocol';
  import { attachmentUrl } from '#lib/attachments.ts';
  import { ImageZoom } from './image-zoom.svelte.ts';
  let {
    image,
    src,
    enlarge = false,
    close,
  }: {
    image: Pick<Attachment, 'name'> & { id?: string };
    /** The picture's own address, for one that is not a chat's file (a plan's). */
    src?: string;
    /** Shows a small picture (a sprite) larger, with its pixels kept sharp. */
    enlarge?: boolean;
    close: () => void;
  } = $props();
  const zoom = new ImageZoom();
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
  onkeydown={(event) => {
    if (event.key === '+' || event.key === '=') zoom.zoomBy(1.5);
    else if (event.key === '-') zoom.zoomBy(1 / 1.5);
    else if (event.key === '0') zoom.reset();
  }}
>
  {#await src ?? attachmentUrl(image.id!) then url}
    <header>
      <span class="image-viewer-name">{image.name}</span>
      <button
        class="icon-button"
        aria-label="Zoom out"
        disabled={zoom.scale <= 1}
        onclick={() => zoom.zoomBy(1 / 1.5)}><ZoomOut size={16} /></button
      >
      <button
        class="image-viewer-zoom"
        aria-label="Fit the picture"
        title="Fit the picture (0)"
        onclick={() => zoom.reset()}>{Math.round(zoom.scale * 100)}%</button
      >
      <button
        class="icon-button"
        aria-label="Zoom in"
        disabled={zoom.scale >= 8}
        onclick={() => zoom.zoomBy(1.5)}><ZoomIn size={16} /></button
      >
      <button class="icon-button" aria-label="Download" onclick={() => save(url)}
        ><Download size={16} /></button
      >
      <button
        class="icon-button"
        aria-label="Close"
        onclick={(event) => event.currentTarget.closest('dialog')?.close()}><X size={16} /></button
      >
    </header>
    <div class="image-viewer-frame" class:zoomed={zoom.scale > 1} {@attach zoom.attach}>
      <img
        src={url}
        alt={image.name}
        class:enlarge
        class:sharp={zoom.scale >= 2}
        style:transform={zoom.transform}
        draggable="false"
      />
    </div>
  {/await}
</dialog>
