<script lang="ts">
  import { ListChecks } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import type { Session } from '@crewstead/core/protocol';
  import PanelSection from '#lib/components/panel/PanelSection.svelte';
  import { listPlans, plansHref, type PlanSummary } from './api.ts';
  let { session }: { session: Session } = $props();
  // Plans live in projects on computers, not in the cloud or on the whole computer.
  const project = $derived(
    session.projectId && !session.projectId.endsWith(':computer') ? session.projectId : '',
  );
  let plans = $state<PlanSummary[]>([]);
  // Read again when the model changes a plan.
  const writes = $derived(
    session.items
      .filter((item) => item.toolName === 'plan_write' || item.toolName === 'plan_patch')
      .map((item) => `${item.id}:${item.status}`)
      .join(),
  );
  $effect(() => {
    void writes;
    if (!project) return void (plans = []);
    void listPlans(project)
      .then((listed) => (plans = listed.plans))
      .catch(() => {});
  });
</script>

<PanelSection
  id="plans"
  label="Plans in this project"
  title="Plans"
  icon={ListChecks}
  count={plans.length || undefined}
  empty={!plans.length}
>
  <ul class="panel-list panel-subagents">
    {#each plans.slice(0, 6) as plan (plan.folder)}
      <li>
        <a href={resolve(plansHref(project, plan.folder) as '/')}>
          <span class="panel-subagent-text">
            <span class="panel-subagent-title">{plan.title}</span>
            <small
              >{plan.errors
                ? 'Needs repair'
                : plan.tasks
                  ? `${plan.done} of ${plan.tasks} tasks done`
                  : 'No tasks yet'}</small
            >
          </span>
        </a>
      </li>
    {/each}
  </ul>
  <a class="panel-link" href={resolve(plansHref(project) as '/')}
    >{plans.length > 6 ? `All ${plans.length} plans` : 'All plans'}</a
  >
</PanelSection>
