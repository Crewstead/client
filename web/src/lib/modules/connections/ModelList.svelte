<script lang="ts">
  import type { ConnectionView, ModelEntryView } from '@crewstead/core/protocol';
  import { connections } from './api.ts';
  import { differsFromListed, isPriced, modelsOn, priceSummary } from './format.ts';
  import PriceDialog from './PriceDialog.svelte';
  import '@crewstead/ui/switch.css';
  let {
    connection,
    note,
    changed,
  }: {
    connection: ConnectionView;
    note?: string;
    changed: (view: ConnectionView) => Promise<void>;
  } = $props();
  const PAGE = 12;
  let query = $state('');
  let filter = $state<'all' | 'on' | 'off'>('all');
  let showAll = $state(false);
  let pricing = $state<ModelEntryView | null>(null);
  let turnOn = $state(false);
  let busy = $state('');
  let error = $state('');
  const on = $derived(modelsOn(connection.models));
  const matches = $derived(
    connection.models
      .filter((model) => {
        const text = query.trim().toLowerCase();
        return !text || `${model.label} ${model.providerModel}`.toLowerCase().includes(text);
      })
      .filter((model) => filter === 'all' || model.enabled === (filter === 'on'))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.label.localeCompare(b.label)),
  );
  const shown = $derived(showAll ? matches : matches.slice(0, PAGE));
  const filters = $derived([
    ['all', 'All', connection.models.length],
    ['on', 'On', on],
    ['off', 'Off', connection.models.length - on],
  ] as const);
  async function update(
    model: ModelEntryView,
    patch: Parameters<typeof connections.updateModel>[2],
  ) {
    busy = model.id;
    error = '';
    try {
      await changed(await connections.updateModel(connection.id, model.id, patch));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not update the model';
      throw cause;
    } finally {
      busy = '';
    }
  }
  function toggle(model: ModelEntryView, input: HTMLInputElement) {
    if (input.checked && !isPriced(model)) {
      // A model needs prices before it can count against the spending limit.
      input.checked = false;
      turnOn = true;
      pricing = model;
      return;
    }
    void update(model, { enabled: input.checked }).catch(() => (input.checked = model.enabled));
  }
</script>

<section class="settings-section" aria-label="Models">
  <div class="section-heading">
    <div>
      <h2>Models</h2>
      <p class="muted-text">
        {on} of {connection.models.length} on. Models that are on appear in the chat model picker.
      </p>
    </div>
  </div>
  {#if connection.models.length > 8}
    <div class="model-tools">
      <input
        type="search"
        bind:value={query}
        placeholder="Search models"
        aria-label="Search models"
      />
      <div class="segmented" role="group" aria-label="Show">
        {#each filters as [value, label, count] (value)}
          <button aria-pressed={filter === value} onclick={() => (filter = value)}
            >{label} {count}</button
          >
        {/each}
      </div>
    </div>
  {/if}
  <div class="settings-card">
    <ul aria-label={`Models from ${connection.label}`}>
      {#each shown as model (model.id)}
        <li class="model-row">
          <span class="row-text"
            ><strong>{model.label}</strong>{#if model.providerModel !== model.label}<small
                >{model.providerModel}</small
              >{/if}</span
          >
          {#if connection.billing === 'plan'}
            <!-- Plan usage has no per-token prices. -->
          {:else if connection.canManage}
            <button
              class="price-button"
              class:missing={!isPriced(model)}
              class:differs={differsFromListed(model)}
              title={differsFromListed(model)
                ? `Differs from ${connection.providerLabel}'s listed price`
                : 'US dollars per million tokens'}
              onclick={() => {
                turnOn = false;
                pricing = model;
              }}
              >{isPriced(model) ? priceSummary(model) : 'Set price'}{differsFromListed(model)
                ? ' · differs from listed'
                : ''}</button
            >
          {:else if isPriced(model)}<span class="row-meta">{priceSummary(model)}</span>{/if}
          <input
            type="checkbox"
            class="switch"
            checked={model.enabled}
            disabled={!connection.canManage || busy === model.id}
            aria-label={`Use ${model.label}`}
            onchange={(event) => toggle(model, event.currentTarget)}
          />
        </li>
      {:else}
        <li><p class="muted-text empty-note">No models match.</p></li>
      {/each}
    </ul>
    {#if matches.length > shown.length}
      <p class="list-more">
        Showing {shown.length} of {matches.length}.
        <button class="link-button" onclick={() => (showAll = true)}>Show all</button>
      </p>
    {/if}
  </div>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
</section>

<PriceDialog
  model={pricing}
  {note}
  provider={connection.providerLabel}
  {turnOn}
  save={(prices, enable) => update(pricing!, { ...prices, ...(enable ? { enabled: true } : {}) })}
  follow={(enable) =>
    update(pricing!, { followListed: true, ...(enable ? { enabled: true } : {}) })}
  close={() => (pricing = null)}
/>
