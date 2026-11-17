<script lang="ts">
  import { Trash2 } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { approvePlan, askRevision, deletePlan, plansHref, type PlanDetail } from './api.ts';
  let {
    project,
    detail,
    openComments,
    reload,
    report,
  }: {
    project: string;
    detail: PlanDetail;
    openComments: number;
    reload: () => Promise<void>;
    /** Shows why an action was refused, or clears it (''). */
    report: (problem: string) => void;
  } = $props();
  let busy = $state(false);
  let confirming = $state(false);
  const STAGE: Record<string, string> = {
    route: 'Choosing how to plan',
    explore: 'Exploring the project',
    extract: 'Writing what was asked',
    decide: 'Listing the decisions',
    detail: 'Detailing the parts',
    consolidate: 'Making the plan smaller',
    review: 'Reviewing',
    adversarial: 'Testing the plan',
    ground: 'Checking against the project',
    revise: 'Revising',
    present: 'Finishing',
  };
  const run = $derived(detail.run);
  const status = $derived(detail.plan?.status);
  /** Approve, or send the open comments to the chat that made the plan; then read the plan again. */
  async function act(action: 'approve' | 'revise' | 'delete') {
    busy = true;
    report('');
    try {
      if (action === 'delete') {
        await deletePlan(project, detail.row.folder);
        await goto(resolve(plansHref(project) as '/'));
        return;
      }
      if (action === 'approve') await approvePlan(project, detail.row.folder);
      else await askRevision(project, detail.row.folder);
      await reload();
    } catch (cause) {
      report(cause instanceof Error ? cause.message : 'That did not work.');
    }
    busy = false;
  }
</script>

<div class="plan-actions">
  <span class="plan-run" role="status"
    >{#if run && run.status !== 'done'}{run.status === 'failed'
        ? `Planning stopped: ${run.error ?? ''}`
        : run.status === 'waiting'
          ? 'Waiting for your answers in the chat'
          : `${STAGE[run.stage] ?? 'Planning'}…`}{:else if run?.singleFamily}Reviewed by the same
      model family: no other was connected{/if}</span
  >
  {#if openComments}<button
      class="button subtle small"
      disabled={busy}
      onclick={() => act('revise')}
      >Revise with {openComments} comment{openComments === 1 ? '' : 's'}</button
    >{/if}
  {#if status === 'draft' || status === 'in_review'}<button
      class="button primary small"
      disabled={busy}
      onclick={() => act('approve')}>Approve</button
    >{/if}
  {#if confirming}<button
      class="button danger small"
      disabled={busy}
      onclick={() => act('delete')}
      onblur={() => (confirming = false)}
      {@attach (node) => node.focus()}>Delete</button
    >{:else}<button
      class="icon-button"
      aria-label="Delete plan"
      title="Delete"
      disabled={busy}
      onclick={() => (confirming = true)}><Trash2 size={14} /></button
    >{/if}
</div>
