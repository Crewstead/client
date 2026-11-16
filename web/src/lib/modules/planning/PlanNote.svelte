<script lang="ts">
  import { getContext } from 'svelte';
  import { LoaderCircle } from '@lucide/svelte';
  import Markdown from '#lib/markdown/Markdown.svelte';
  import { readNote } from './api.ts';
  let { file }: { file: string } = $props();
  /** Which plan this is, set by the plan page. */
  const place = getContext<{ project: string; folder: string }>('plan-place');
  let content = $state<string>();
  let error = $state('');
  // Read when the element opens, not with the page: notes can be long.
  $effect(() => {
    void readNote(place.project, place.folder, file)
      .then((note) => (content = note.content))
      .catch(
        (cause: unknown) =>
          (error = cause instanceof Error ? cause.message : 'Could not read the note.'),
      );
  });
</script>

<code>{file}</code>
{#if error}<span class="plan-note-error">{error}</span>
{:else if content === undefined}<span
    class="plan-note-loading"
    role="status"
    aria-label="Reading the note"><LoaderCircle size={14} /></span
  >
{:else}<div class="markdown plan-full plan-note-text"><Markdown text={content} /></div>{/if}
