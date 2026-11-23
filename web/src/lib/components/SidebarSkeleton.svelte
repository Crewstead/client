<script lang="ts">
  import '@crewstead/ui/sidebar-skeleton.css';
  /** Stand-ins while a workspace loads: the projects bar's tiles, or the chat list's rows. */
  let { part }: { part: 'rail' | 'list' } = $props();
  // Rows of differing lengths, so the list reads as titles rather than a block.
  const rows = [78, 62, 86, 54, 70, 46, 64];
</script>

{#if part === 'rail'}<div class="project-rail rail-skeleton" aria-hidden="true">
    {#each [0, 1, 2, 3] as tile (tile)}<span class="skeleton skeleton-tile"></span>{/each}
  </div>
{:else}<div class="list-skeleton" role="status" aria-label="Loading chats">
    {#each rows as width, index (index)}<span
        class="skeleton skeleton-row"
        style:width={`${width}%`}
      ></span>{/each}
  </div>{/if}
