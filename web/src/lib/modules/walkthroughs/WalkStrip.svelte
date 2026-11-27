<script lang="ts">
  import type { WalkActor } from '@crewstead/core/protocol';
  let {
    actors,
    flow,
    waiting,
  }: {
    actors: WalkActor[];
    /** Who talks to whom at this step, in order. */
    flow: string[];
    /** Sides whose technical name is not shown yet: the slide that explains it comes later. */
    waiting: string[];
  } = $props();
  const linked = (a: string, b: string) =>
    flow.some(
      (side, at) =>
        at > 0 && [side, flow[at - 1]].includes(a) && [side, flow[at - 1]].includes(b) && a !== b,
    );
</script>

<!-- Who talks to whom: one box per side, a link between neighbours, an arc from the first to the last. -->
<div class="walk-who" style:--n={actors.length}>
  {#if actors.length > 2}
    <div class="walk-arc" class:on={linked(actors[0]!.id, actors.at(-1)!.id)}></div>
  {/if}
  <div
    class="walk-row"
    style:grid-template-columns={actors.map(() => 'minmax(0, 1fr)').join(' var(--walk-link) ')}
  >
    {#each actors as actor, index (actor.id)}
      {#if index}<i class="walk-link" class:on={linked(actors[index - 1]!.id, actor.id)}></i>{/if}
      <div class="walk-node" class:on={flow.includes(actor.id)}>
        <b>{actor.name}</b><span class:wait={waiting.includes(actor.id)}>{actor.sub ?? ''}</span>
      </div>
    {/each}
  </div>
</div>
