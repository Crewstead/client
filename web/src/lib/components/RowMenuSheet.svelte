<script lang="ts">
  import { Check } from '@lucide/svelte';
  import type { MenuItem } from './RowMenu.svelte';
  import '@crewstead/ui/action-sheet.css';
  let { title, items, close }: { title: string; items: MenuItem[]; close: () => void } = $props();
  let dialog: HTMLDialogElement;
  /** The label of the destructive item asking again. */
  let confirming = $state<string>();
  function choose(item: MenuItem) {
    if (item.confirm && confirming !== item.label) {
      confirming = item.label;
      return;
    }
    dialog.close();
    void item.run();
  }
</script>

<!-- A row's settings on touch screens: the same items as the "…" menu, in a sheet from below. -->
<dialog
  class="action-sheet"
  aria-label={title}
  bind:this={dialog}
  {@attach (node) => node.showModal()}
  onclose={close}
  onclick={(event) => {
    if (event.target === event.currentTarget) dialog.close();
  }}
>
  <p class="action-sheet-title">{title}</p>
  <div class="action-sheet-actions">
    {#each items as item (item.label)}
      <button
        role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={item.checked}
        class:danger={!!item.confirm}
        disabled={item.disabled}
        onclick={() => choose(item)}
      >
        <span>
          {confirming === item.label ? item.confirm : item.label}
          {#if item.hint}<small>{item.hint}</small>{/if}
        </span>
        {#if item.checked}<Check size={18} />{/if}
      </button>
    {/each}
  </div>
  <button class="action-sheet-cancel" onclick={() => dialog.close()}>Cancel</button>
</dialog>
