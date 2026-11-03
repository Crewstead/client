<script lang="ts">
  import { ChevronDown } from '@lucide/svelte';
  import type { Model } from '@crewstead/core/protocol';
  import { effortSetting, efforts } from '#lib/effort.svelte.ts';
  import ModelDialog from './ModelDialog.svelte';
  import '@crewstead/ui/model-picker.css';
  import '@crewstead/ui/place-dialog.css';
  let {
    models,
    value = $bindable(),
    disabled = false,
    effort = false,
  }: {
    models: Model[];
    value: string;
    disabled?: boolean;
    /** The chosen model accepts an effort setting; the dialog offers it below the models. */
    effort?: boolean;
  } = $props();
  const label = $derived(models.find((model) => model.id === value)?.label);
  const effortLabel = $derived(efforts.find((option) => option.value === effortSetting.value)!);
  // Like Claude desktop, a non-default effort shows next to the model's name.
  const summary = $derived(
    effort && effortSetting.value !== 'auto' ? `${label} · ${effortLabel.label}` : label,
  );
  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
</script>

{#if (models.length > 1 || effort) && !disabled}
  <button
    type="button"
    bind:this={trigger}
    class="place-trigger model-picker"
    aria-haspopup="dialog"
    aria-label="Choose model"
    title={summary ?? 'Choose model'}
    onclick={() => (open = true)}
    ><span class="picker-label">{summary ?? 'Choose model'}</span><ChevronDown size={12} /></button
  >
{:else}
  <span class="model-label">{summary ?? 'No model available'}</span>
{/if}
{#if open}<ModelDialog
    {models}
    {value}
    {effort}
    choose={(id) => (value = id)}
    close={() => {
      open = false;
      trigger?.focus();
    }}
  />{/if}
