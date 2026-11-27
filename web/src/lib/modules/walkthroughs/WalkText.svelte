<script lang="ts">
  import { segments } from './rich.ts';
  let { text }: { text: string } = $props();
</script>

<!-- Prose with `code` and terms the reader can open; the viewer listens for clicks on a term. -->
{#each segments(text) as part, index (index)}{#if part.kind === 'code'}<code>{part.text}</code
    >{:else if part.kind === 'term'}<button type="button" class="walk-term" data-term={part.key}
      >{part.text}</button
    >{:else}{part.text}{/if}{/each}
