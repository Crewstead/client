<script lang="ts">
  import { FileDiff } from '@lucide/svelte';
  import type { ChangedFile } from './timeline-entries.ts';
  let { files }: { files: ChangedFile[] } = $props();
  const added = $derived(files.reduce((sum, file) => sum + file.added, 0));
  const removed = $derived(files.reduce((sum, file) => sum + file.removed, 0));
</script>

<!-- What a finished reply changed, file by file; each edit's diff stays on its own card above. -->
<section class="changed-files" aria-label="Changed files">
  <header>
    <FileDiff size={14} />{#if files.length === 1}<code>{files[0]!.path}</code>{:else}<span
        >{files.length} files changed</span
      >{/if}<span class="diff-count"><ins>+{added}</ins> <del>−{removed}</del></span>
  </header>
  {#if files.length > 1}<ul>
      {#each files as file (file.path)}
        <li>
          <code>{file.path}</code><span class="diff-count"
            ><ins>+{file.added}</ins> <del>−{file.removed}</del></span
          >
        </li>
      {/each}
    </ul>{/if}
</section>
