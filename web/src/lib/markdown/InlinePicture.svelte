<script lang="ts">
  import { ImageOff } from '@lucide/svelte';
  import type { Attachment } from '@crewstead/core/protocol';
  import { attachmentUrl } from '#lib/attachments.ts';
  import ImageViewer from '#lib/components/attachments/ImageViewer.svelte';
  import { usePictureOwner, usePictures } from './pictures.ts';
  let { src, alt }: { src: string; alt: string } = $props();
  const pictures = usePictures();
  const owner = usePictureOwner();
  // A web address is never loaded by itself (it would tell that site who reads the chat): a link.
  const web = $derived(/^https?:\/\//i.test(src));
  let viewing = $state<Attachment>();
  const found = $derived(
    !web && pictures
      ? pictures
          .find(src, owner)
          .then(async (picture) => ({ picture, url: await attachmentUrl(picture.id) }))
      : undefined,
  );
</script>

{#if web}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve --><a
    href={src}
    target="_blank"
    rel="noopener noreferrer nofollow">{alt || src}</a
  >{:else if !found}<span class="md-picture-missing">{alt || src}</span>{:else}{#await found}<span
      class="md-picture-loading"
      title={src}>{alt || src}</span
    >{:then { picture, url }}<button
      type="button"
      class="md-picture"
      title={alt || picture.name}
      onclick={() => (viewing = picture)}><img src={url} alt={alt || picture.name} /></button
    >{:catch error}<span class="md-picture-missing" title={error?.message ?? ''}
      ><ImageOff size={13} />{alt || src}</span
    >{/await}{/if}
{#if viewing}<ImageViewer image={viewing} close={() => (viewing = undefined)} />{/if}
