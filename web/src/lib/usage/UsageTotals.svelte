<script lang="ts">
  import type { UsageReport } from '@crewstead/core/protocol';
  import { compact } from '#lib/components/chat-stats.ts';
  import { usd } from './usage.svelte.ts';
  let { report }: { report: UsageReport } = $props();
  const totals = $derived(report.totals);
  const cards = $derived([
    {
      label: 'Tokens',
      value: compact(totals.input + totals.output),
      detail: `${compact(totals.input)} sent · ${compact(totals.output)} received`,
    },
    {
      label: 'Cost',
      value: usd(totals.costUsd),
      detail: totals.costUsd
        ? `Keys billed per token${totals.costEstimated ? ', partly estimated' : ''}`
        : 'Plans such as Claude Code are not billed here',
    },
    {
      label: 'Chats',
      value: String(totals.chats),
      detail: `${totals.newChats} new · ${totals.activeDays} active ${totals.activeDays === 1 ? 'day' : 'days'}`,
    },
    {
      label: 'Messages',
      value: String(totals.messages),
      detail: `${totals.replies} ${totals.replies === 1 ? 'reply' : 'replies'} · ${totals.requests} model requests`,
    },
    {
      label: 'Tool calls',
      value: compact(totals.toolCalls),
      detail: `${report.tools.length} different tools`,
    },
    {
      label: 'Files changed',
      value: compact(report.files.count),
      detail: `+${compact(report.files.added)} −${compact(report.files.removed)} lines`,
    },
    {
      label: 'Reply speed',
      value: report.tokensPerSecond === null ? '—' : `${report.tokensPerSecond}`,
      detail:
        report.tokensPerSecond === null ? 'Not measured yet' : 'tokens a second while writing',
    },
    {
      label: 'Cache',
      value: report.cacheShare === null ? '—' : `${Math.round(report.cacheShare * 100)}%`,
      detail: `${compact(totals.cached)} of the sent tokens read from cache`,
    },
  ]);
</script>

<dl class="usage-totals">
  {#each cards as card (card.label)}
    <div class="usage-total">
      <dt>{card.label}</dt>
      <dd>{card.value}</dd>
      <dd class="usage-total-detail">{card.detail}</dd>
    </div>
  {/each}
</dl>
