<script lang="ts">
  import type { WalkActor, WalkDiagramRow } from '@crewstead/core/protocol';
  import WalkText from './WalkText.svelte';
  let {
    actors,
    rows,
    plain = false,
    now,
    done,
  }: {
    actors: WalkActor[];
    rows: WalkDiagramRow[];
    /** Leaves the sides' technical names out, for a diagram shown before they are explained. */
    plain?: boolean;
    /** Beside the code: the rows being written now, and the ones written before. */
    now?: number[];
    done?: number[];
  } = $props();
  const ids = $derived(actors.map((actor) => actor.id));
  /** An arrow from the middle of one column to the middle of another, through any side between. */
  function arrow(row: WalkDiagramRow) {
    const path = ('go' in row ? row.go : 'back' in row ? row.back : []).map((id) =>
      ids.indexOf(id),
    );
    const low = Math.min(...path);
    const far = Math.max(...path) - low || 1;
    const hops = path.slice(1).map((to, at) => Math.abs(to - path[at]!));
    return { low, far, hops, left: path[0]! > path.at(-1)! };
  }
</script>

<!-- A sequence diagram: who sends what to whom, top to bottom. -->
<div class="walk-seq" class:marked={now !== undefined} style:--n={actors.length}>
  <div class="walk-seq-head">
    {#each actors as actor (actor.id)}
      <div class="walk-seq-who">
        <b>{actor.name}</b>{#if !plain && actor.sub}<span>{actor.sub}</span>{/if}
      </div>
    {/each}
  </div>
  <div class="walk-seq-body">
    {#each actors as actor, index (actor.id)}
      <i class="walk-seq-life" style:left="{((index + 0.5) * 100) / actors.length}%"></i>
    {/each}
    {#each rows as row, index (index)}
      <div class="walk-seq-row" class:now={now?.includes(index)} class:done={done?.includes(index)}>
        {#if 'at' in row}
          {@const at = ids.indexOf(row.at)}
          <div
            class="walk-seq-self"
            style:grid-column={at + 1}
            style:justify-self={at === 0 ? 'start' : at === actors.length - 1 ? 'end' : 'center'}
          >
            <WalkText text={row.say} />
          </div>
        {:else}
          {@const way = arrow(row)}
          <div
            class="walk-seq-msg"
            class:back={'back' in row}
            class:left={way.left}
            style:grid-column="{way.low + 1} / {way.low + way.far + 2}"
            style:margin-inline="{50 / (way.far + 1)}%"
          >
            <!-- A short arrow may carry a wider label. -->
            <span style:max-width="{Math.max(100, 200 / way.far)}%"
              ><WalkText text={row.say} /></span
            >
            <div class="walk-seq-line">
              {#each way.hops as hop, at (at)}<i style:flex={hop}></i>{/each}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
