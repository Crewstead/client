<script lang="ts">
  import { Check, ImagePlus } from '@lucide/svelte';
  import { useReview } from './review.ts';
  let { item }: { item: string } = $props();
  const review = useReview();
  const mine = $derived(review?.comments.filter((comment) => comment.item === item) ?? []);
  let text = $state('');
  let busy = $state(false);
  const when = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  let picker = $state<HTMLInputElement>();
  /** Pictures pasted into the comment box, or picked, are shown with the element. */
  function addPictures(list: FileList | null | undefined) {
    const files = [...(list ?? [])].filter((file) => file.type.startsWith('image/'));
    if (review && files.length) void review.addImages(item, files);
    return files.length > 0;
  }
  async function send() {
    if (!review || !text.trim() || busy) return;
    busy = true;
    if (await review.add(item, text.trim())) text = '';
    busy = false;
  }
</script>

{#if review}<div class="plan-comments">
    {#each mine as comment (comment.id)}
      <div class="plan-comment" class:resolved={!!comment.resolved}>
        <p>{comment.text}</p>
        <small>
          <span>{when(comment.at)}</span><span aria-hidden="true">·</span>
          {#if comment.resolved}<span>{comment.resolved}</span>{:else}<button
              class="link-button"
              onclick={() => review.resolve(comment.id)}><Check size={12} /> Resolve</button
            >{/if}
        </small>
      </div>
    {/each}
    <div class="plan-comment-new">
      <textarea
        rows="1"
        placeholder="Comment"
        aria-label={`Comment on ${item}`}
        bind:value={text}
        onpaste={(event) => {
          if (addPictures(event.clipboardData?.files)) event.preventDefault();
        }}
        onkeydown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void send();
        }}></textarea>
      {#if text.trim()}<button class="button subtle small" disabled={busy} onclick={send}
          >Add</button
        >{:else}<button
          class="icon-button"
          aria-label={`Add a picture to ${item}`}
          title="Add a picture"
          onclick={() => picker?.click()}><ImagePlus size={15} /></button
        >{/if}
      <input
        bind:this={picker}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        multiple
        hidden
        onchange={(event) => {
          addPictures(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
    </div>
  </div>{/if}
