<script lang="ts">
  import { Check, ChevronRight, X, ShieldCheck, ShieldX, ShieldQuestion } from '@lucide/svelte';
  import type { TimelineItem } from '@crewstead/core/protocol';
  import DiffView from './DiffView.svelte';
  import ToolLine from './ToolLine.svelte';
  import { metaFor } from './tool-meta.ts';
  import { commandSummary, resultSummary } from './tool-result.ts';
  let {
    item,
    decide,
  }: {
    item: TimelineItem;
    /** 'approve-all' approves this call and switches every chat to approving everything. True once
     * the hub took the answer. */
    decide: (id: string, decision: 'approve' | 'reject' | 'approve-all') => Promise<boolean>;
  } = $props();
  let busy = $state(false);
  /** Answered here: shown at once, before the hub reports the call running (it may take a while). */
  let answered = $state<'approve' | 'reject' | 'approve-all'>();
  /** The answer, from this page or as the hub reports it (another device, or after a reload). */
  const given = $derived(
    answered ??
      (item.answered === 'approved'
        ? 'approve'
        : item.answered === 'declined'
          ? 'reject'
          : undefined),
  );
  const asking = $derived(item.status === 'pending' && !!item.approvalId && !given);
  const meta = $derived(metaFor(item.toolName));
  const note = $derived(meta.kind === 'note');
  const Icon = $derived(meta.icon);
  const path = $derived.by(() => {
    try {
      const value = JSON.parse(item.arguments ?? '{}').path;
      return typeof value === 'string' ? value : '';
    } catch {
      return '';
    }
  });
  const network = $derived(item.text.startsWith('[network] '));
  const footer = $derived(
    note
      ? 'Writes one file · can’t run commands'
      : meta.kind === 'command'
        ? `Runs in the project sandbox · ${network ? 'network on' : 'no network'}`
        : meta.kind === 'change'
          ? 'Changes files in this project'
          : meta.kind === 'browser'
            ? item.toolName?.startsWith('web_')
              ? 'Acts in this chat’s browser on the Crewstead server'
              : 'Acts in this chat’s browser on the project’s computer'
            : meta.kind === 'chat'
              ? 'Changes your chats in this workspace'
              : 'Requires your approval',
  );
  const approveLabel = $derived(
    note
      ? 'Approve write'
      : meta.kind === 'command'
        ? 'Run'
        : meta.kind === 'change'
          ? 'Approve change'
          : meta.kind === 'browser' || meta.kind === 'chat'
            ? 'Allow'
            : 'Approve',
  );
  const review = $derived(item.review?.outcome === 'checking' ? undefined : item.review);
  const status = $derived.by(() => {
    if (item.status === 'pending')
      return item.review?.outcome === 'checking'
        ? 'Checking'
        : given === 'reject'
          ? 'Declining'
          : given
            ? 'Allowed · running'
            : item.approvalId
              ? 'Approval required'
              : 'Running';
    if (item.status === 'completed' && item.autoApproved) return 'approved automatically';
    if (item.status === 'completed' && review?.outcome === 'approved') return 'approved by review';
    if (item.status === 'rejected' && review?.outcome === 'declined') return 'declined by review';
    return item.status;
  });
  const reviewText = $derived(
    !review
      ? ''
      : review.outcome === 'unavailable'
        ? `Auto-review couldn’t decide: ${review.rationale} Your approval is needed.`
        : `Auto-review ${review.outcome}${review.risk ? ` · ${review.risk} risk` : ''}: ${review.rationale}`,
  );
  async function answer(decision: 'approve' | 'reject' | 'approve-all') {
    if (!item.approvalId || busy) return;
    busy = true;
    try {
      if (await decide(item.approvalId, decision)) answered = decision;
    } finally {
      busy = false;
    }
  }
</script>

{#if (meta.kind === 'read' && !item.approvalId) || ((meta.kind === 'chat' || meta.kind === 'command') && !asking)}<ToolLine
    {item}
  />{:else}<article
    class="tool-card"
    data-status={item.status}
    aria-label={note ? 'Request to write a note' : `Request: ${meta.title}`}
  >
    <header>
      <Icon size={17} /><strong>{meta.title}</strong>{#if path && meta.kind === 'change'}<code
          class="tool-file">{path}</code
        >{/if}<span class="tool-status">{status}</span>
    </header>
    {#if item.diff}<DiffView diff={item.diff} />{:else}<div class="tool-body">
        {#if note}<div class="tool-path">Notes folder <span>/</span> note.txt</div>{/if}
        <pre>{network ? item.text.slice('[network] '.length) : item.text}</pre>
      </div>{/if}
    {#if review}<p class="tool-review" data-outcome={review.outcome}>
        {#if review.outcome === 'approved'}<ShieldCheck
            size={14}
          />{:else if review.outcome === 'declined'}<ShieldX size={14} />{:else}<ShieldQuestion
            size={14}
          />{/if}<span>{reviewText}</span>
      </p>{/if}
    {#if asking}<div class="approval-footer">
        <span><ShieldCheck size={14} /> {footer}</span>
        <div>
          <button class="link-button" disabled={busy} onclick={() => answer('approve-all')}
            >Approve all from now on</button
          ><button class="button subtle" disabled={busy} onclick={() => answer('reject')}
            ><X size={14} /> Decline</button
          ><button class="button primary small" disabled={busy} onclick={() => answer('approve')}
            ><Check size={14} /> {approveLabel}</button
          >
        </div>
      </div>{/if}
    {#if item.status === 'pending' && item.progress}<pre
        class="tool-output live"
        aria-label="Output so far">{item.progress}</pre>{/if}
    <!-- A declined call's result holds instructions for the model; the review line says it for people. -->
    {#if item.result && review?.outcome !== 'declined'}{#if meta.kind === 'command' && item.status === 'completed'}
        {@const ran = commandSummary(item.result)}
        <details class="tool-result folded" data-failed={ran.failed}>
          <summary
            ><ChevronRight size={13} class="tool-line-chevron" /><span>{ran.line}</span><small
              >Show output</small
            ></summary
          >
          <pre class="tool-output">{item.result.split('\n').slice(1).join('\n')}</pre>
        </details>{:else}
        {@const shown = resultSummary(item.result, meta.kind === 'browser')}
        {#if shown.full}<details class="tool-result folded">
            <summary
              ><ChevronRight size={13} class="tool-line-chevron" /><span>{shown.line}</span><small
                >{meta.kind === 'browser' ? 'Show what the model saw' : 'Show all'}</small
              ></summary
            >
            <pre class="tool-output">{shown.full}</pre>
          </details>{:else}<div class="tool-result">{shown.line}</div>{/if}
      {/if}{/if}
  </article>{/if}
