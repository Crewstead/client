<script lang="ts">
  import type { ChangedFile } from './timeline-entries.ts';
  let { files, limit = 6 }: { files: ChangedFile[]; limit?: number } = $props();
  let all = $state(false);
  // A few over the limit are shown rather than hidden behind a button.
  const shown = $derived(all || files.length <= limit + 2 ? files : files.slice(0, limit));
  const split = (path: string) => {
    const at = path.lastIndexOf('/');
    return at < 0
      ? { name: path, folder: '' }
      : { name: path.slice(at + 1), folder: path.slice(0, at) };
  };
</script>

<!-- Changed files, one short line each: the name, its folder, and the lines added and removed. -->
<ul class="change-list">
  {#each shown as file (file.path)}
    {@const { name, folder } = split(file.path)}
    <li title={file.path}>
      <span class="change-name">{name}</span>{#if folder}<span class="change-folder"
          >&lrm;{folder}&lrm;</span
        >{/if}<span class="diff-count"><ins>+{file.added}</ins> <del>−{file.removed}</del></span>
    </li>
  {/each}
</ul>
{#if shown.length < files.length || all}<button
    class="change-more"
    aria-expanded={all}
    onclick={() => (all = !all)}>{all ? 'Show fewer' : `Show all ${files.length}`}</button
  >{/if}
