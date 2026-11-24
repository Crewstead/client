<script lang="ts">
  import { Check, Ellipsis } from '@lucide/svelte';
  import Dropdown from './Dropdown.svelte';
  import '@crewstead/ui/row-menu.css';
  import RowMenuSheet from './RowMenuSheet.svelte';

  /** A choice that is on or off, or one action (destructive ones confirm first). */
  export interface MenuItem {
    label: string;
    /** On or off: shown with a tick, toggled on click. */
    checked?: boolean;
    disabled?: boolean;
    /** Why it is disabled, or what it does. */
    hint?: string;
    /** Destructive: asks again in the menu ("Remove? Its files stay."). */
    confirm?: string;
    run: () => unknown;
  }
  let {
    label,
    items,
    disabled = false,
    title,
  }: {
    label: string;
    items: MenuItem[];
    disabled?: boolean;
    /** The sheet's heading on touch screens; the label by default. */
    title?: string;
  } = $props();
  /** Touch screens get the items as a sheet from the bottom instead. */
  let sheet = $state(false);
  let open = $state(false);
  /** The label of the destructive item asking again. */
  let confirming = $state<string>();
  $effect(() => {
    if (!open) confirming = undefined;
  });
  function choose(item: MenuItem, close: () => void) {
    if (item.confirm && confirming !== item.label) {
      confirming = item.label;
      return;
    }
    close();
    void item.run();
  }
</script>

<!-- A row's settings, folded behind "…" instead of a row of switches. -->
<Dropdown
  class="row-menu"
  triggerClass="icon-button"
  align="end"
  role="menu"
  {label}
  {disabled}
  bind:open
  pressed={() => {
    if (!matchMedia('(hover: none)').matches) return false;
    sheet = true;
    return true;
  }}
>
  {#snippet trigger()}<Ellipsis size={16} />{/snippet}
  {#snippet children(close)}
    {#each items as item (item.label)}
      <button
        class="menu-item"
        role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={item.checked}
        class:danger={!!item.confirm}
        disabled={item.disabled}
        title={item.hint}
        onclick={() => choose(item, close)}
        ><span class="menu-text"
          ><span>{confirming === item.label ? item.confirm : item.label}</span>{#if item.hint}<small
              >{item.hint}</small
            >{/if}</span
        >{#if item.checked}<Check class="menu-check" size={14} />{/if}</button
      >
    {/each}
  {/snippet}
</Dropdown>
{#if sheet}<RowMenuSheet title={title ?? label} {items} close={() => (sheet = false)} />{/if}
