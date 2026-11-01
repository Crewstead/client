<script lang="ts">
  import { Check, Ellipsis } from '@lucide/svelte';
  import { keepInView } from '#lib/keep-in-view.ts';

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
  }: { label: string; items: MenuItem[]; disabled?: boolean } = $props();
  let details = $state<HTMLDetailsElement>();
  /** The label of the destructive item asking again. */
  let confirming = $state<string>();
  function close() {
    if (details) details.open = false;
    confirming = undefined;
  }
  function choose(item: MenuItem) {
    if (item.confirm && confirming !== item.label) {
      confirming = item.label;
      return;
    }
    close();
    void item.run();
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (event.target instanceof Node && !details?.contains(event.target)) close();
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') close();
  }}
/>
<!-- A row's settings, folded behind "…" instead of a row of switches. -->
<details class="row-menu" bind:this={details} use:keepInView>
  <summary
    class="icon-button"
    aria-label={label}
    title={label}
    aria-disabled={disabled}
    onclick={(event) => disabled && event.preventDefault()}><Ellipsis size={16} /></summary
  >
  <div class="row-menu-items" role="menu">
    {#each items as item (item.label)}
      {#if item.confirm}<hr />{/if}
      <button
        role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={item.checked}
        class:danger={!!item.confirm}
        disabled={item.disabled}
        title={item.hint}
        onclick={() => choose(item)}
      >
        <span>
          {confirming === item.label ? item.confirm : item.label}
          {#if item.hint}<small>{item.hint}</small>{/if}
        </span>
        {#if item.checked}<Check size={14} />{/if}
      </button>
    {/each}
  </div>
</details>
