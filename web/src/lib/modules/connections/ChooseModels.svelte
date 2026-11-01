<script lang="ts" module>
  export interface Choice {
    on: boolean;
    prices: { inputUsd: number | null; cachedInputUsd: number | null; outputUsd: number | null };
  }
</script>

<script lang="ts">
  import type { ModelEntryView } from '@crewstead/core/protocol';
  import { isPriced, priceSummary } from './format.ts';
  import '@crewstead/ui/keys.css';
  let {
    models,
    choices = $bindable(),
    disabled = false,
  }: { models: ModelEntryView[]; choices: Record<string, Choice>; disabled?: boolean } = $props();
  const id = $props.id();
  const fields = [
    ['inputUsd', 'In'],
    ['cachedInputUsd', 'Cached'],
    ['outputUsd', 'Out'],
  ] as const;
  let query = $state('');
  const sorted = $derived([...models].sort((a, b) => a.label.localeCompare(b.label)));
  const shown = $derived(
    sorted.filter((model) =>
      `${model.label} ${model.providerModel}`.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  );
  function toggle(model: ModelEntryView, on: boolean) {
    choices[model.id] = {
      on,
      prices: choices[model.id]?.prices ?? {
        inputUsd: model.inputUsd,
        cachedInputUsd: model.cachedInputUsd,
        outputUsd: model.outputUsd,
      },
    };
  }
</script>

{#if models.length > 8}
  <input
    class="choose-search"
    type="search"
    bind:value={query}
    placeholder={`Search ${models.length} models`}
    aria-label="Search models"
  />
{/if}
<ul class="choose-list" aria-label="Models to turn on">
  {#each shown as model (model.id)}
    {@const choice = choices[model.id]}
    <li>
      <label class="choose-row">
        <input
          type="checkbox"
          checked={choice?.on ?? false}
          {disabled}
          onchange={(event) => toggle(model, event.currentTarget.checked)}
        />
        <span class="row-text"
          ><strong>{model.label}</strong>{#if model.providerModel !== model.label}<small
              >{model.providerModel}</small
            >{/if}</span
        >
        <span class="row-meta">{isPriced(model) ? priceSummary(model) : 'Price needed'}</span>
      </label>
      {#if choice?.on && !isPriced(model)}
        <div class="choose-prices" role="group" aria-label={`Prices for ${model.label}`}>
          {#each fields as [key, label] (key)}
            <label for={`${id}-${model.id}-${key}`}>{label}</label>
            <input
              id={`${id}-${model.id}-${key}`}
              type="number"
              inputmode="decimal"
              bind:value={choices[model.id]!.prices[key]}
              min="0"
              max="1000"
              step="any"
              placeholder="0.00"
              required
              {disabled}
            />
          {/each}
        </div>
      {/if}
    </li>
  {:else}
    <li class="provider-empty">No models match.</li>
  {/each}
</ul>
