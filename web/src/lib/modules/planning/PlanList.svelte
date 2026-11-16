<script lang="ts">
  import { ArrowLeft, ChevronRight, TriangleAlert } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { plansHref, type PlanSummary } from './api.ts';
  import '@crewstead/ui/plans.css';
  let {
    project,
    name,
    plans,
    offline = false,
  }: { project: string; name: string; plans: PlanSummary[]; offline?: boolean } = $props();
  const words = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
</script>

<div class="page-container plan-page">
  <a class="back-link" href={resolve('/')}><ArrowLeft size={15} /> Back to chat</a>
  <header class="plan-head">
    <h1>Plans</h1>
    <p class="plan-sub">{name}</p>
  </header>
  {#if offline}<p class="plan-note" role="status">
      The computer is offline. These are the versions read last.
    </p>{/if}
  {#if plans.length}<ul class="plan-list" aria-label="Plans">
      {#each plans as plan (plan.folder)}
        <li>
          <a href={resolve(plansHref(project, plan.folder) as '/')}>
            <span class="plan-list-text"
              ><span class="plan-item-title">{plan.title}</span><span class="plan-short"
                >{plan.planId
                  ? `${words(plan.kind)} · ${words(plan.status).toLowerCase()} · ${day(plan.updated)}`
                  : `The file cannot be read · ${day(plan.updated)}`}</span
              ></span
            >
            {#if plan.errors}<span class="plan-badge" data-tone="bad"
                ><TriangleAlert size={12} /> Needs repair</span
              >{:else if plan.tasks}<span
                class="plan-badge"
                data-tone={plan.done === plan.tasks ? 'good' : 'muted'}
                >{plan.done} of {plan.tasks} tasks</span
              >{/if}
            <ChevronRight size={15} class="plan-list-go" />
          </a>
        </li>
      {/each}
    </ul>{:else}<p class="plan-empty">No plans in this project yet.</p>{/if}
</div>
