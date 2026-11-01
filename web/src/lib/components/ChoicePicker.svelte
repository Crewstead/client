<script lang="ts" generics="T extends string">
  import { Check, ChevronDown } from '@lucide/svelte';
  import { keepInView } from '#lib/keep-in-view.ts';
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
  let details = $state<HTMLDetailsElement>();
  let trigger = $state<HTMLElement>();
  const current = $derived(choices.find((choice) => choice.value === value));
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
<!-- A choice in Settings, drawn like the prompt box's pickers: opens below, notes under each option. -->
<details class="model-picker choice-picker" bind:this={details} use:keepInView>
  <summary
    bind:this={trigger}
    aria-label={`${label}: ${current?.label ?? ''}`}
    aria-disabled={disabled}
    onclick={(event) => disabled && event.preventDefault()}
    >{current?.label}<ChevronDown size={13} /></summary
  >
  <fieldset class="model-options">
    <legend class="sr-only">{label}</legend>
    {#each choices as choice (choice.value)}
      <label class:unavailable={choice.disabled}
        ><input
          type="radio"
          name={id}
          checked={choice.value === value}
          disabled={choice.disabled}
          onchange={() => {
            close(true);
            choose(choice.value);
          }}
        />
        <span class="effort-option"
          ><span>{choice.label}</span>{#if choice.note}<small>{choice.note}</small>{/if}</span
        >{#if choice.value === value}<Check size={14} />{/if}
      </label>
    {/each}
  </fieldset>
</details>
