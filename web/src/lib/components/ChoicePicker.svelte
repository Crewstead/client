<script lang="ts" generics="T extends string">
  import { Check, ChevronDown } from '@lucide/svelte';
  import Dropdown from './Dropdown.svelte';
  import '@crewstead/ui/model-picker.css';
  let {
    label,
    value,
    choices,
    disabled = false,
    choose,
  }: {
    /** What is being chosen, for screen readers, e.g. "Where searches go". */
    label: string;
    value: T;
    choices: readonly { value: T; label: string; note?: string; disabled?: boolean }[];
    disabled?: boolean;
    choose: (value: T) => void;
  } = $props();
  const id = $props.id();
  const current = $derived(choices.find((choice) => choice.value === value));
</script>

<!-- A choice in Settings: a bordered button opening its options below, a note under each. -->
<Dropdown
  class="model-picker choice-picker"
  align="end"
  label={`${label}: ${current?.label ?? ''}`}
  {disabled}
>
  {#snippet trigger()}{current?.label}<ChevronDown size={13} />{/snippet}
  {#snippet children(close)}
    <fieldset>
      <legend class="sr-only">{label}</legend>
      {#each choices as choice (choice.value)}
        <label class="menu-item" class:unavailable={choice.disabled}
          ><input
            type="radio"
            name={id}
            checked={choice.value === value}
            disabled={choice.disabled}
            onchange={() => {
              close(true);
              choose(choice.value);
            }}
          /><span class="menu-text"
            ><span>{choice.label}</span>{#if choice.note}<small>{choice.note}</small>{/if}</span
          >{#if choice.value === value}<Check class="menu-check" size={14} />{/if}</label
        >
      {/each}
    </fieldset>
  {/snippet}
</Dropdown>
