<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { compact, percent } from '#lib/components/chat-stats.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import BarList from './BarList.svelte';
  import DailyChart from './DailyChart.svelte';
  import HourHeatmap from './HourHeatmap.svelte';
  import UsageTotals from './UsageTotals.svelte';
  import { PERIODS, Usage, usd } from './usage.svelte.ts';
  import '@crewstead/ui/usage.css';
  const workspace = useWorkspace();
  const usage = new Usage();
  let days = $state(30);
  $effect(() => void usage.load(workspace.context, days));
  const report = $derived(usage.report);
  const models = $derived(workspace.catalog?.models ?? []);
  const label = (id: string) =>
    models.find((model) => model.id === id)?.label ?? 'A model no longer connected';
  /** The biggest models keep a colour of their own, in the chart and the lists. */
  const series = $derived(report?.models.slice(0, 6).map((model) => model.id) ?? []);
  const colour = (id: string) => {
    const index = series.indexOf(id);
    return index < 0 ? 'var(--chart-7)' : `var(--chart-${index + 1})`;
  };
  const placeName = (id: string, fallback: string) =>
    workspace.catalog?.projects.find((project) => project.id === id)?.name ?? fallback;
  const purposeNames = {
    reply: 'Replies',
    review: 'Automatic reviews',
    compact: 'Summaries',
    title: 'Chat names',
  };
  const workspaceName = $derived(
    workspace.catalog?.contexts.find((context) => context.id === workspace.context)?.label ??
      'Personal',
  );
</script>

<div class="page-container usage-page">
  <a class="back-link" href={resolve('/')}><ArrowLeft size={15} /> Back to chat</a>
  <header class="usage-head">
    <div>
      <h1>Usage</h1>
      <p class="usage-sub">
        {workspaceName} · your chats, models and tools{report ? ` · ${report.timeZone}` : ''}
      </p>
    </div>
    <div class="usage-toggle period" role="group" aria-label="Period">
      {#each PERIODS as period (period.days)}
        <button aria-pressed={days === period.days} onclick={() => (days = period.days)}
          >{period.label}</button
        >
      {/each}
    </div>
  </header>

  {#if usage.error}<p class="usage-error" role="alert">{usage.error}</p>{/if}
  {#if report}
    <div class="usage-body" class:loading={usage.loading}>
      <UsageTotals {report} />
      <DailyChart daily={report.daily} {series} {colour} {label} />
      <div class="usage-grid">
        <BarList
          title="Models"
          empty="No model requests in this period."
          rows={report.models.map((model) => ({
            key: model.id,
            label: label(model.id),
            value: model.input + model.output,
            shown: compact(model.input + model.output),
            detail: `${model.requests} req${model.costUsd ? ` · ${usd(model.costUsd)}` : ''}`,
            colour: colour(model.id),
          }))}
        />
        <BarList
          title="Places"
          empty="No chats in this period."
          rows={report.places.map((place) => ({
            key: place.id || 'cloud',
            label: placeName(place.id, place.name),
            value: place.tokens,
            shown: compact(place.tokens),
            detail: `${place.chats} ${place.chats === 1 ? 'chat' : 'chats'}`,
          }))}
        />
        <BarList
          title="Tools"
          empty="No tool calls in this period."
          rows={report.tools.slice(0, 10).map((tool) => ({
            key: tool.name,
            label: tool.name,
            value: tool.calls,
            shown: String(tool.calls),
            ...(tool.declined || tool.failed
              ? {
                  detail: [
                    tool.declined && `${tool.declined} declined`,
                    tool.failed && `${tool.failed} failed`,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }
              : {}),
          }))}
        >
          {#snippet extra()}
            <dl class="usage-facts">
              <div>
                <dt>Approvals asked</dt>
                <dd>{report.approvals.asked}</dd>
              </div>
              <div>
                <dt>Reviewed automatically</dt>
                <dd>{report.approvals.reviewed}</dd>
              </div>
              <div>
                <dt>Allowed without asking</dt>
                <dd>{report.approvals.automatic}</dd>
              </div>
              <div>
                <dt>Declined</dt>
                <dd>{report.approvals.declined}</dd>
              </div>
              <div>
                <dt>Files changed</dt>
                <dd>
                  {report.files.count}
                  <small class="diff-count"
                    ><ins>+{report.files.added}</ins> <del>−{report.files.removed}</del></small
                  >
                </dd>
              </div>
            </dl>
          {/snippet}
        </BarList>
        <BarList
          title="Busiest chats"
          rows={report.topChats.map((chat) => ({
            key: chat.id,
            label: chat.title,
            value: chat.tokens,
            shown: compact(chat.tokens),
            href: resolve('/sessions/[id]', { id: chat.id }),
          }))}
        />
        <BarList
          title="What tokens went to"
          rows={Object.entries(report.purposes)
            .filter(([, tokens]) => tokens)
            .sort((a, b) => b[1] - a[1])
            .map(([purpose, tokens]) => ({
              key: purpose,
              label: purposeNames[purpose as keyof typeof purposeNames],
              value: tokens,
              shown: compact(tokens),
              detail: percent(tokens, report.totals.input + report.totals.output),
            }))}
        />
        <HourHeatmap hours={report.hours} />
      </div>
      {#if report.approximateBefore}
        <p class="usage-note">
          Before {new Date(report.approximateBefore).toLocaleDateString()} the hub kept only each chat’s
          totals, so that usage is counted on the chat’s last day.
        </p>
      {/if}
    </div>
  {:else if usage.loading}
    <p class="usage-empty">Loading…</p>
  {/if}
</div>
