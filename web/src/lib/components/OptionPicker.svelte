<script lang="ts" generics="Value extends string">
  import { Check, ChevronDown } from '@lucide/svelte';
  import '@crewstead/ui/option-picker.css';
  let {
    value = $bindable(),
    options,
    label,
    disabled = false,
    wide = false,
    placeholder = '',
    onchange,
  }: {
    value: Value;
    options: Array<{ value: Value; label: string; hint?: string }>;
    /** Accessible name, e.g. "Role for alex"; the trigger reads "<label>: <chosen option>". */
    label: string;
    disabled?: boolean;
    /** Fill the available width, for use as a form field. */
    wide?: boolean;
    /** Shown while no option is chosen. */
    placeholder?: string;
    /** With onchange the parent owns the value (e.g. reloads it from the server); otherwise bind it. */
    onchange?: (value: Value) => void;
  } = $props();
  const id = $props.id();
  const chosen = $derived(options.find((option) => option.value === value));
  let details = $state<HTMLDetailsElement>();
  let trigger = $state<HTMLElement>();
  function close(focus = false) {
    if (!details?.open) return;
    details.open = false;
    if (focus) trigger?.focus();
  }
  function pick(next: Value) {
    close(true);
    if (next === value) return;
    if (onchange) onchange(next);
    else value = next;
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
<details class="option-picker" class:disabled class:wide bind:this={details}>
  <summary
    bind:this={trigger}
    aria-label={`${label}: ${chosen?.label ?? (value || placeholder)}`}
    tabindex={disabled ? -1 : 0}
    onclick={(event) => disabled && event.preventDefault()}
    >{#if chosen || value}{chosen?.label ?? value}{:else}<span class="option-placeholder"
        >{placeholder}</span
      >{/if}<ChevronDown size={14} /></summary
  >
  <fieldset class="option-list">
    <legend class="sr-only">{label}</legend>
    {#each options as option (option.value)}
      <label
        ><input
          type="radio"
          name={id}
          value={option.value}
          checked={option.value === value}
          onchange={() => pick(option.value)}
          onclick={() => option.value === value && close(true)}
        />
        <span
          ><strong>{option.label}</strong>{#if option.hint}<small>{option.hint}</small>{/if}</span
        >{#if option.value === value}<Check size={14} />{/if}
      </label>
    {/each}
  </fieldset>
</details>
