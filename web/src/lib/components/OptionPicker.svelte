<script lang="ts" generics="Value extends string">
  import { Check, ChevronDown } from '@lucide/svelte';
  import Dropdown from './Dropdown.svelte';
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
  function pick(next: Value, close: (focus?: boolean) => void) {
    close(true);
    if (next === value) return;
    if (onchange) onchange(next);
    else value = next;
  }
</script>

<!-- A form field's choice: an input-like trigger, the options (with notes) below it. -->
<Dropdown
  class="option-picker"
  label={`${label}: ${chosen?.label ?? (value || placeholder)}`}
  {disabled}
  {wide}
  align="end"
>
  {#snippet trigger()}{#if chosen || value}{chosen?.label ?? value}{:else}<span
        class="option-placeholder">{placeholder}</span
      >{/if}<ChevronDown size={14} />{/snippet}
  {#snippet children(close)}
    <fieldset>
      <legend class="sr-only">{label}</legend>
      {#each options as option (option.value)}
        <label class="menu-item"
          ><input
            type="radio"
            name={id}
            value={option.value}
            checked={option.value === value}
            onchange={() => pick(option.value, close)}
            onclick={() => option.value === value && close(true)}
          /><span class="menu-text"
            ><span>{option.label}</span>{#if option.hint}<small>{option.hint}</small>{/if}</span
          >{#if option.value === value}<Check class="menu-check" size={14} />{/if}</label
        >
      {/each}
    </fieldset>
  {/snippet}
</Dropdown>
