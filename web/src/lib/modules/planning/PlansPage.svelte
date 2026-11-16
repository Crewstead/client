<script lang="ts">
  import { LoaderCircle } from '@lucide/svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { listPlans, readPlanDetail, type PlanDetail, type PlanSummary } from './api.ts';
  import PlanList from './PlanList.svelte';
  import PlanView from './PlanView.svelte';
  import '@crewstead/ui/plans.css';
  let { project, plan }: { project: string; plan?: string } = $props();
  const workspace = useWorkspace();
  const place = $derived(workspace.catalog?.projects.find((entry) => entry.id === project));
  let list = $state<{ plans: PlanSummary[]; offline?: boolean }>();
  let detail = $state<PlanDetail>();
  let error = $state('');
  const readDetail = async () => {
    if (plan) detail = await readPlanDetail(project, plan);
  };
  $effect(() => {
    error = '';
    const loading = plan ? readDetail() : listPlans(project).then((value) => (list = value));
    loading.catch(
      (cause: unknown) =>
        (error = cause instanceof Error ? cause.message : 'Could not read the plans.'),
    );
  });
</script>

{#if error}<div class="page-container"><p class="error-banner" role="alert">{error}</p></div>
{:else if plan && detail?.plan}<PlanView {project} {detail} reload={readDetail} />
{:else if plan && detail}<div class="page-container">
    <p class="error-banner" role="alert">
      This plan cannot be read: {detail.row.errors?.join(' ')}
    </p>
  </div>
{:else if !plan && list}<PlanList
    {project}
    name={place ? `${place.name}${place.machine ? ` on ${place.machine}` : ''}` : project}
    plans={list.plans}
    offline={list.offline}
  />
{:else}<div class="page-container">
    <p class="plan-loading" role="status" aria-label="Loading plans"><LoaderCircle size={18} /></p>
  </div>{/if}
