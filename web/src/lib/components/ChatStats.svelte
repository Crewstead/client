<script lang="ts">
  import { X } from '@lucide/svelte';
  import type { Model, Session } from '@crewstead/core/protocol';
  import { request, scoped } from '#lib/api.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { chatStats, compact, percent, plural } from './chat-stats.ts';
  import ContextBreakdown from './ContextBreakdown.svelte';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/stats.css';
  let { session, models }: { session: Session; models: Model[] } = $props();
  const workspace = useWorkspace();
  const id = $props.id();
  let dialog = $state<HTMLDialogElement>();
  let cost = $state<{ usd: number; estimated: boolean; byModel: Record<string, number> }>();
  const stats = $derived(chatStats(session));
  const label = (modelId: string) =>
    models.find((model) => model.id === modelId)?.label ?? 'A model no longer connected';
  const contextWindow = $derived(
    models.find((model) => model.id === session.modelId)?.contextTokens,
  );
  const usd = (value: number) => (value < 0.01 ? '<$0.01' : `$${value.toFixed(2)}`);
  const date = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  /** Opened from the context meter in the prompt box. */
  export async function open() {
    dialog?.showModal();
    cost = undefined;
    try {
      cost = await request(scoped(`/sessions/${session.id}/cost`, workspace.context));
    } catch {
      // Cost is optional: without the billing module the panel simply leaves it out.
    }
  }
</script>

<!-- Opened from the context meter in the prompt box. -->
<dialog bind:this={dialog} class="dialog-content stats-dialog" aria-labelledby={`${id}-title`}>
  <header class="stats-head">
    <h2 id={`${id}-title`} class="dialog-title">Context and statistics</h2>
    <button class="icon-button" aria-label="Close" onclick={() => dialog?.close()}
      ><X size={16} /></button
    >
  </header>
  {#if session.contextUsed}<ContextBreakdown
      parts={session.contextParts}
      used={session.contextUsed}
      window={contextWindow ?? 128_000}
    />{/if}
  <dl class="stats-grid">
    <div>
      <dt>Messages</dt>
      <dd>
        {stats.messages}
        <small>· {stats.replies === 1 ? '1 reply' : `${stats.replies} replies`}</small>
      </dd>
    </div>
    <div>
      <dt>Tool calls</dt>
      <dd>
        {stats.tools.total}
        {#if stats.tools.total}<small
            >· {[
              plural(stats.tools.reads, 'read'),
              plural(stats.tools.changes, 'change'),
              plural(stats.tools.commands, 'command'),
            ].join(', ')}</small
          >{/if}
      </dd>
    </div>
    <div>
      <dt>Files changed</dt>
      <dd>
        {stats.files.count}
        {#if stats.files.count}<small class="diff-count"
            ><ins>+{stats.files.added}</ins> <del>−{stats.files.removed}</del></small
          >{/if}
      </dd>
    </div>
    <div>
      <dt>Approvals</dt>
      <dd>
        {stats.approvals.asked} asked
        <small
          >· {stats.approvals.reviewed} reviewed, {stats.approvals.automatic} automatic{stats.tools
            .declined
            ? `, ${stats.tools.declined} declined`
            : ''}</small
        >
      </dd>
    </div>
    <div>
      <dt>Context now</dt>
      <dd>
        {session.contextUsed ? compact(session.contextUsed) : '—'}
        {#if session.contextUsed}<small
            >of {compact(contextWindow ?? 128_000)} ({percent(
              session.contextUsed,
              contextWindow ?? 128_000,
            )})</small
          >{/if}
      </dd>
    </div>
    <div>
      <dt>Started</dt>
      <dd>{date(session.createdAt)}</dd>
    </div>
  </dl>

  <h3 class="stats-section">Tokens by model</h3>
  {#if stats.models.length}
    <div class="stats-table-wrap">
      <table class="stats-table">
        <thead>
          <tr
            ><th>Model</th><th>Requests</th><th>Sent</th><th class="cached">Cached</th><th
              >Received</th
            >{#if cost?.usd}<th>Cost</th>{/if}</tr
          >
        </thead>
        <tbody>
          {#each stats.models as model (model.id)}
            <tr>
              <td>{label(model.id)}</td>
              <td
                >{model.requests}{#if model.reviews || model.summaries}<small
                    >+{model.reviews + model.summaries}</small
                  >{/if}</td
              >
              <td>{compact(model.input)}</td>
              <td class="cached">{compact(model.cached)}</td>
              <td>{compact(model.output)}</td>
              {#if cost?.usd}<td>{cost.byModel[model.id] ? usd(cost.byModel[model.id]!) : '—'}</td
                >{/if}
            </tr>
          {/each}
        </tbody>
        {#if stats.models.length > 1}<tfoot>
            <tr>
              <td>Total</td><td>{stats.total.requests}</td><td>{compact(stats.total.input)}</td><td
                class="cached">{compact(stats.total.cached)}</td
              ><td>{compact(stats.total.output)}</td>{#if cost?.usd}<td>{usd(cost.usd)}</td>{/if}
            </tr>
          </tfoot>{/if}
      </table>
    </div>
    <p class="stats-note">
      “+” counts automatic reviews and summaries. Sent includes cached tokens.
      {#if cost?.usd}Cost covers provider keys billed per token{cost.estimated
          ? '; some requests are counted at their reserved maximum'
          : ''}; plans such as Claude Code cost nothing here.{/if}
    </p>
  {:else}<p class="stats-note">
      No token counts yet. They are recorded from now on for every reply.
    </p>{/if}
</dialog>
