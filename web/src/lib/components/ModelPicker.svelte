<script lang="ts">
  import { keepInView } from '#lib/keep-in-view.ts';
  import { ChevronDown, Check } from '@lucide/svelte';
  import type { Model } from '@crewstead/core/protocol';
  import { effortSetting, efforts } from '#lib/effort.svelte.ts';
  import EffortMenu from './EffortMenu.svelte';
  import '@crewstead/ui/model-picker.css';
  let {
    models,
    value = $bindable(),
    disabled = false,
    effort = false,
  }: {
    models: Model[];
    value: string;
    disabled?: boolean;
    /** The chosen model accepts an effort setting; the menu offers it below the models. */
    effort?: boolean;
  } = $props();
  const id = $props.id();
  const label = $derived(models.find((model) => model.id === value)?.label);
  const effortLabel = $derived(efforts.find((option) => option.value === effortSetting.value)!);
  // Like Claude desktop, a non-default effort shows next to the model's name.
  const summary = $derived(
    effort && effortSetting.value !== 'auto' ? `${label} · ${effortLabel.label}` : label,
  );
  /** Models under their heading (a provider key, or Claude Code on a computer), in catalog order. */
  const groups = $derived(
    models.reduce<{ name: string; models: Model[] }[]>((list, model) => {
      const name = model.group ?? model.connection ?? '';
      const group = list.find((entry) => entry.name === name);
      if (group) group.models.push(model);
      else list.push({ name, models: [model] });
      return list;
    }, []),
  );
  let details = $state<HTMLDetailsElement>();
  let trigger = $state<HTMLElement>();
  function close(focus = false) {
    if (!details?.open) return;
    details.open = false;
    if (focus) trigger?.focus();
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (event.target instanceof Node && !details?.contains(event.target)) close();
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') close(true);
  }}
/>
{#if (models.length > 1 || effort) && !disabled}
  <details class="model-picker" bind:this={details} use:keepInView>
    <summary bind:this={trigger} aria-label="Choose model" title={summary ?? 'Choose model'}
      ><span class="picker-label">{summary ?? 'Choose model'}</span><ChevronDown
        size={12}
      /></summary
    >
    <div class="model-options">
      <fieldset class="model-list">
        <legend class="sr-only">Model</legend>
        {#each groups as group (group.name)}
          {#if group.name && groups.length > 1}<p class="model-group">{group.name}</p>{/if}
          {#each group.models as model (model.id)}
            <label title={model.label}
              ><input
                type="radio"
                name={id}
                aria-label={model.label}
                value={model.id}
                bind:group={value}
                onchange={() => close(true)}
              />
              <!-- Under its heading a model needs only its short name; alone, where it comes from
                   is a quiet second line. -->
              <span class="effort-option"
                ><span>{groups.length > 1 ? (model.short ?? model.label) : model.label}</span
                >{#if groups.length === 1 && model.connection}<small>{model.connection}</small
                  >{/if}</span
              >{#if model.id === value}<Check size={14} />{/if}
            </label>
          {/each}
        {/each}
      </fieldset>
      {#if effort}<EffortMenu chosen={() => close(true)} />{/if}
    </div>
  </details>
{:else}
  <span class="model-label">{summary ?? 'No model available'}</span>
{/if}
