<script lang="ts">
  import { ChevronRight, SquareTerminal } from '@lucide/svelte';
  import { watchSummary, type WatchReport } from './watch-report.ts';
  import { useTerminals } from '#lib/terminals/terminals.svelte.ts';
  import '@crewstead/ui/watch-notice.css';
  let { report }: { report: WatchReport } = $props();
  const terminals = useTerminals();
</script>

<!--
  A background command's report to the chat (which the model reads in full): one quiet line, opened
  for the output it brought.
-->
<details class="tool-line watch-notice" data-ended={!!report.ended}>
  <summary aria-label={`Watch ${report.label}: ${watchSummary(report)}`}
    ><ChevronRight size={13} class="tool-line-chevron" /><SquareTerminal size={14} /><span
      class="watch-label">{report.label}</span
    ><span class="tool-line-text">{watchSummary(report)}</span></summary
  >
  <div class="watch-body">
    <div class="watch-command-row">
      <code class="watch-command">{report.command}</code>
      {#if terminals?.find(report.watchId)}<button
          class="link-button"
          onclick={() => terminals.show(report.watchId)}>Open terminal</button
        >{/if}
    </div>
    {#if report.lines.length}<pre class="tool-output">{report.lines.join('\n')}{report.more
          ? `\n… ${report.more} more lines left out.`
          : ''}</pre>{/if}
  </div>
</details>
