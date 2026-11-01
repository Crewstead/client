<script lang="ts">
  import { ChevronRight, Telescope } from '@lucide/svelte';
  import type { TimelineItem } from '@crewstead/core/protocol';
  import ToolLine from './ToolLine.svelte';
  let { items }: { items: TimelineItem[] } = $props();
  const count = (name: string) => items.filter((item) => item.toolName === name).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const summary = $derived(
    [
      count('read_file') && `read ${plural(count('read_file'), 'file', 'files')}`,
      count('search_files') && plural(count('search_files'), 'search', 'searches'),
      count('list_files') && plural(count('list_files'), 'folder listed', 'folders listed'),
      count('run_command') && plural(count('run_command'), 'command', 'commands'),
    ]
      .filter(Boolean)
      .join(', '),
  );
  const running = $derived(items.some((item) => item.status === 'pending'));
  const failed = $derived(items.filter((item) => item.status === 'failed').length);
</script>

<!-- Several reads in a row fold into one line, like Codex's "Explored"; one read shows on its own. -->
{#if items.length === 1}<ToolLine item={items[0]!} />{:else}<details class="explored">
    <summary
      ><ChevronRight size={13} class="tool-line-chevron" /><Telescope size={14} /><span
        >{running ? 'Exploring' : 'Explored'}</span
      ><span class="explored-detail">{summary}</span>{#if failed}<span class="tool-status"
          >{failed} failed</span
        >{/if}</summary
    >
    <div class="explored-items">
      {#each items as item (item.id)}<ToolLine {item} />{/each}
    </div>
  </details>{/if}
