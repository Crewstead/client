<script lang="ts">
  import type { WalkBlock, WalkStep, Walkthrough } from '@crewstead/core/protocol';
  import WalkSequence from './WalkSequence.svelte';
  import WalkText from './WalkText.svelte';
  let {
    walk,
    step,
    known,
    know,
  }: {
    walk: Walkthrough;
    step: WalkStep;
    known: string[];
    know: (key: string, yes: boolean) => void;
  } = $props();
  const actors = $derived(walk.actors ?? []);
</script>

{#snippet list(items: string[])}
  {#each items as item, index (index)}<li><WalkText text={item} /></li>{/each}
{/snippet}
{#snippet diagram(name: string, titled: boolean)}
  {@const drawn = walk.diagrams?.[name]}
  {#if drawn}
    {#if titled}<h3>{drawn.title}</h3>{/if}
    <WalkSequence {actors} rows={drawn.rows} plain={drawn.plain} />
  {/if}
{/snippet}
{#snippet block(item: WalkBlock)}
  {#if typeof item === 'string'}
    <p><WalkText text={item} /></p>
  {:else if 'diagram' in item}
    {@render diagram(item.diagram, false)}
  {:else if 'ul' in item}
    <ul>{@render list(item.ul)}</ul>
  {:else if 'ol' in item}
    <ol>{@render list(item.ol)}</ol>
  {:else if 'h' in item}
    <h3>{item.h}</h3>
  {:else if 'table' in item}
    <div class="walk-wide">
      <table>
        <thead>
          <tr
            >{#each item.table.head as cell, index (index)}<th>{cell}</th>{/each}</tr
          >
        </thead>
        <tbody>
          {#each item.table.rows as row, index (index)}
            <tr
              >{#each row as cell, at (at)}<td><WalkText text={cell} /></td>{/each}</tr
            >
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="walk-cols">
      {#each item.cols as column, index (index)}
        <div>
          {#if 'diagram' in column}
            {@render diagram(column.diagram, true)}
          {:else}
            <h3>{column.h}</h3>
            <ol>{@render list(column.ol)}</ol>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

<!-- A slide: the first screen, or something explained without code. -->
{#if step.id === 'intro'}
  <h1>{step.title}</h1>
  <div class="walk-body">
    {#each step.body ?? [] as item, index (index)}{@render block(item)}{/each}
    {#if walk.known?.length}
      <fieldset class="walk-known">
        <legend>Already know some of this? Ticked slides are skipped</legend>
        {#each walk.known as [key, label] (key)}
          <label class="walk-check">
            <input
              type="checkbox"
              checked={known.includes(key)}
              onchange={(event) => know(key, event.currentTarget.checked)}
            /><span>{label}</span>
          </label>
        {/each}
      </fieldset>
    {/if}
    <p class="walk-hint">
      Words with a dotted underline open a short explanation. The arrow keys turn the pages.
    </p>
  </div>
{:else}
  <p class="walk-eyebrow">Concept</p>
  <h2>{step.title}</h2>
  <div class="walk-body">
    {#each step.body ?? [] as item, index (index)}{@render block(item)}{/each}
  </div>
{/if}
