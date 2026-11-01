<script lang="ts">
  import { ChevronRight, Circle, CircleCheck, CircleDot, ListChecks } from '@lucide/svelte';
  import type { PlanStep } from '@crewstead/core/protocol';
  import '@crewstead/ui/plan-steps.css';
  let {
    steps,
    docked = false,
  }: {
    steps: PlanStep[];
    /** Above the prompt box while its turn runs; it moves to the end of the turn when that ends. */
    docked?: boolean;
  } = $props();
  const done = $derived(steps.filter((step) => step.status === 'completed').length);
  // Folded at the end of a turn with every step done; open while there is something to follow.
  const finished = $derived(!docked && done === steps.length);
</script>

<!-- The model's step list for this turn, as it last kept it with plan_update. -->
<details class="plan-steps" class:docked open={!finished}>
  <summary
    ><ListChecks size={14} aria-hidden="true" /><span>Steps</span><span class="plan-count"
      >{done} of {steps.length} done</span
    ><ChevronRight size={13} class="plan-chevron" aria-hidden="true" /></summary
  >
  <ol aria-label="Steps">
    {#each steps as step, index (index)}
      <li data-status={step.status} class:live={docked && step.status === 'in_progress'}>
        {#if step.status === 'completed'}<CircleCheck size={14} aria-label="Done" />
        {:else if step.status === 'in_progress'}<CircleDot size={14} aria-label="In progress" />
        {:else}<Circle size={14} aria-label="Not started" />{/if}
        <span>{step.step}</span>
      </li>
    {/each}
  </ol>
</details>
