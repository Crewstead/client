<script lang="ts">
  import { X } from '@lucide/svelte';
  import ImageViewer from '#lib/components/attachments/ImageViewer.svelte';
  import { planFileUrl } from './api.ts';
  import { useReview } from './review.ts';
  import '@crewstead/ui/usage.css';
  import '@crewstead/ui/plan-media.css';
  let {
    item,
  }: {
    item: { id: string; images?: { file: string; caption: string }[]; mock?: string };
  } = $props();
  const review = useReview();
  const view = $derived(review?.view);
  let viewing = $state<{ file: string; caption: string }>();
  // The mock at a phone's width or the page's; it runs in a sandbox with no way to the hub.
  let width = $state<'phone' | 'wide'>('wide');
</script>

{#if view && item.images?.length}<ul class="plan-images">
    {#each item.images as image (image.file)}
      <li>
        <button class="plan-image" onclick={() => (viewing = image)} aria-label={image.caption}
          ><img src={planFileUrl(view, image.file)} alt={image.caption} loading="lazy" /></button
        >
        <span class="plan-image-caption">{image.caption}</span>
        {#if review}<button
            class="icon-button plan-image-remove"
            aria-label={`Remove ${image.caption}`}
            title="Remove"
            onclick={() => review.removeImage(item.id, image.file)}><X size={13} /></button
          >{/if}
      </li>
    {/each}
  </ul>{/if}
{#if view && item.mock}<div class="plan-mock">
    <div class="usage-toggle" role="group" aria-label="Mock width">
      <button aria-pressed={width === 'phone'} onclick={() => (width = 'phone')}>Phone</button>
      <button aria-pressed={width === 'wide'} onclick={() => (width = 'wide')}>Wide</button>
    </div>
    <iframe
      class="plan-mock-frame"
      class:phone={width === 'phone'}
      title={`Mock of ${item.id}`}
      sandbox="allow-scripts"
      loading="lazy"
      src={planFileUrl(view, item.mock)}
    ></iframe>
  </div>{/if}
{#if viewing && view}<ImageViewer
    image={{ name: viewing.caption }}
    src={planFileUrl(view, viewing.file)}
    enlarge
    close={() => (viewing = undefined)}
  />{/if}
