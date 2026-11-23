<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import { X } from '@lucide/svelte';
  import type { Model, Session } from '@crewstead/core/protocol';
  import { request, scoped } from '#lib/api.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { chatStats, compact } from './chat-stats.ts';
  import ContextBreakdown from './ContextBreakdown.svelte';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/stats.css';
  let {
    session,
    models,
    loadAll,
  }: {
    session: Session;
    models: Model[];
    /** Loads the chat's messages not sent yet, which its counts need. */
    loadAll?: () => Promise<void>;
  } = $props();
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
  const count = (value: number) => value.toLocaleString();
  /** "Nov 23, 6:34 AM"; the year too when it is not this one. */
  const started = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(new Date(iso).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
      hour: 'numeric',
      minute: '2-digit',
    });
  const usd = (value: number) => (value < 0.01 ? '<$0.01' : `$${value.toFixed(2)}`);
  // The cost is read with the chat and again whenever a reply ends, not on opening: read then, it
  // arrived after the dialog showed and added its column under the reader's eyes.
  let costOf = '';
  $effect(() => {
    if (session.status === 'running' || session.status === 'awaiting_approval') return;
    void session.updatedAt;
    const asked = session.id;
    if (costOf !== asked) cost = undefined;
    costOf = asked;
    request<NonNullable<typeof cost>>(scoped(`/sessions/${asked}/cost`, workspace.context))
      .then((value) => {
        if (costOf === asked) cost = value;
      })
      // Cost is optional: without the billing module the dialog simply leaves it out.
      .catch(() => {});
  });
  /** Opened from the context meter in the prompt box. */
  export function open() {
    dialog?.showModal();
    void loadAll?.();
  }
</script>

{#snippet line(name: string, value: string, tone?: 'added' | 'removed')}
  <div>
    <dt>{name}</dt>
    <dd class={tone}>{value}</dd>
  </div>
{/snippet}

<!-- Opened from the context meter in the prompt box. -->
<dialog
  {@attach closeOutside}
  bind:this={dialog}
  class="dialog-content stats-dialog"
  aria-labelledby={`${id}-title`}
>
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
  <!-- Four cards: a total each, and what it is made of, one figure a line. -->
  <div class="stats-grid">
    <section aria-label="Messages">
      <h3>Messages</h3>
      <p class="stats-value">{count(stats.messages)}</p>
      <dl>
        {@render line('Replies', count(stats.replies))}
        <div class="stats-stacked">
          <dt>Started</dt>
          <dd>{started(session.createdAt)}</dd>
        </div>
      </dl>
    </section>
    <section aria-label="Tool calls">
      <h3>Tool calls</h3>
      <p class="stats-value">{count(stats.tools.total)}</p>
      <dl>
        {@render line('Reads', count(stats.tools.reads))}
        {@render line('Changes', count(stats.tools.changes))}
        {@render line('Commands', count(stats.tools.commands))}
      </dl>
    </section>
    <section aria-label="Files changed">
      <h3>Files changed</h3>
      <p class="stats-value">{count(stats.files.count)}</p>
      <dl>
        {@render line('Lines added', `+${count(stats.files.added)}`, 'added')}
        {@render line('Lines removed', `−${count(stats.files.removed)}`, 'removed')}
      </dl>
    </section>
    <section aria-label="Approvals">
      <h3>Approvals</h3>
      <p class="stats-value">{count(stats.approvals.asked)} <span>asked you</span></p>
      <dl>
        {@render line('Reviewed', count(stats.approvals.reviewed))}
        {@render line('Automatic', count(stats.approvals.automatic))}
        {#if stats.tools.declined}{@render line('Declined', count(stats.tools.declined))}{/if}
      </dl>
    </section>
  </div>

  <h3 class="stats-section">Tokens by model</h3>
  {#if stats.models.length}
    <div class="stats-table-wrap">
      <table class="stats-table">
        <thead>
          <tr
            ><th>Model</th><th>Requests</th><th>Sent</th><th class="cached">Cached</th><th
              >Received</th
            >{#if cost}<th>Cost</th>{/if}</tr
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
              {#if cost}<td>{cost.byModel[model.id] ? usd(cost.byModel[model.id]!) : '—'}</td>{/if}
            </tr>
          {/each}
        </tbody>
        {#if stats.models.length > 1}<tfoot>
            <tr>
              <td>Total</td><td>{stats.total.requests}</td><td>{compact(stats.total.input)}</td><td
                class="cached">{compact(stats.total.cached)}</td
              ><td>{compact(stats.total.output)}</td>{#if cost}<td
                  >{cost.usd ? usd(cost.usd) : '—'}</td
                >{/if}
            </tr>
          </tfoot>{/if}
      </table>
    </div>
    <!-- On a phone, each model is a card of its own: a table that narrow squeezes its names. -->
    <div class="stats-model-cards">
      {#each stats.models as model (model.id)}
        <section aria-label={label(model.id)}>
          <h4>{label(model.id)}</h4>
          <dl>
            {@render line(
              'Requests',
              `${count(model.requests)}${model.reviews || model.summaries ? ` +${count(model.reviews + model.summaries)}` : ''}`,
            )}
            {@render line('Sent', compact(model.input))}
            {@render line('Cached', compact(model.cached))}
            {@render line('Received', compact(model.output))}
            {#if cost}{@render line(
                'Cost',
                cost.byModel[model.id] ? usd(cost.byModel[model.id]!) : '—',
              )}{/if}
          </dl>
        </section>
      {/each}
    </div>
    <p class="stats-note">
      “+” counts automatic reviews and summaries. Sent includes cached tokens.
      {#if cost}Cost covers provider keys billed per token{cost.estimated
          ? '; some requests are counted at their reserved maximum'
          : ''}; plans such as Claude Code cost nothing here.{/if}
    </p>
  {:else}<p class="stats-note">
      No token counts yet. They are recorded from now on for every reply.
    </p>{/if}
</dialog>
