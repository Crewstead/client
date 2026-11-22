<script lang="ts">
  import { Check, ChevronRight, ListFilter } from '@lucide/svelte';
  import { DEFAULT_LIST_VIEW, type ListView } from './list-view.ts';
  import '@crewstead/ui/list-menu.css';
  let {
    view,
    change,
    addSection,
  }: {
    view: ListView;
    change: (view: ListView) => void;
    /** Asks for a new section's name. */
    addSection: () => void;
  } = $props();
  type Sub = 'group' | 'sort' | 'show';
  let open = $state(false);
  let sub = $state<Sub | null>(null);
  /** The item the pointer opened last, so the click that follows does not close it again. */
  let hovered = '';
  let root = $state<HTMLElement>();
  const groups = [
    { value: 'none', label: 'None' },
    { value: 'date', label: 'Date' },
    { value: 'model', label: 'Model' },
  ] as const;
  const sorts = [
    { value: 'updated', label: 'Last updated' },
    { value: 'created', label: 'Created' },
    { value: 'name', label: 'Name' },
  ] as const;
  const shows = [
    { key: 'metadata', label: 'Metadata' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'side', label: 'Side chats' },
    { key: 'empty', label: 'Empty projects' },
  ] as const;
  const plain = $derived(
    view.group === DEFAULT_LIST_VIEW.group &&
      view.sort === DEFAULT_LIST_VIEW.sort &&
      JSON.stringify(view.show) === JSON.stringify(DEFAULT_LIST_VIEW.show),
  );
  function close() {
    open = false;
    sub = null;
  }
  function pick(next: Partial<ListView>) {
    change({ ...view, ...next });
    close();
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (open && !root?.contains(event.target as Node)) close();
  }}
  onkeydown={(event) => {
    if (open && event.key === 'Escape') close();
  }}
/>

<!-- How the list shows its chats, as in Claude Code: grouping, order, what shows, and sections. -->
<div class="list-menu" bind:this={root}>
  <button
    class="new-session"
    class:active={!plain}
    aria-label="List options"
    title="List options"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open ? close() : (open = true))}><ListFilter size={15} /></button
  >
  {#if open}
    <div class="list-menu-panel" role="menu" aria-label="List options">
      {#each [{ id: 'group', label: 'Group by', value: groups.find((g) => g.value === view.group)?.label }, { id: 'sort', label: 'Sort by', value: sorts.find((s) => s.value === view.sort)?.label }, { id: 'show', label: 'Show', value: '' }] as const as item (item.id)}
        <div class="list-menu-item">
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={sub === item.id}
            class:current={sub === item.id}
            onpointerenter={(event) => {
              if (event.pointerType !== 'mouse') return;
              sub = item.id;
              hovered = item.id;
            }}
            onclick={() => {
              // A click right after the pointer opened it keeps it open; a second click closes it.
              sub = sub === item.id && hovered !== item.id ? null : item.id;
              hovered = '';
            }}
            >{item.label}<span class="list-menu-value">{item.value}</span><ChevronRight
              size={14}
            /></button
          >
          {#if sub === item.id}
            <div class="list-menu-sub" role="menu" aria-label={item.label}>
              {#if item.id === 'group'}
                {#each groups as choice (choice.value)}
                  <button
                    role="menuitemradio"
                    aria-checked={view.group === choice.value}
                    onclick={() => pick({ group: choice.value })}
                    >{choice.label}{#if view.group === choice.value}<Check size={14} />{/if}</button
                  >
                {/each}
              {:else if item.id === 'sort'}
                {#each sorts as choice (choice.value)}
                  <button
                    role="menuitemradio"
                    aria-checked={view.sort === choice.value}
                    onclick={() => pick({ sort: choice.value })}
                    >{choice.label}{#if view.sort === choice.value}<Check size={14} />{/if}</button
                  >
                {/each}
              {:else}
                {#each shows as choice (choice.key)}
                  <button
                    role="menuitemcheckbox"
                    aria-checked={view.show[choice.key]}
                    onclick={() =>
                      change({
                        ...view,
                        show: { ...view.show, [choice.key]: !view.show[choice.key] },
                      })}
                    >{choice.label}{#if view.show[choice.key]}<Check size={14} />{/if}</button
                  >
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      {/each}
      <hr />
      <button
        role="menuitem"
        onpointerenter={() => (sub = null)}
        onclick={() => {
          close();
          addSection();
        }}>New section</button
      >
      <hr />
      <button
        role="menuitem"
        disabled={plain}
        onpointerenter={() => (sub = null)}
        onclick={() => pick({ group: 'none', sort: 'updated', show: DEFAULT_LIST_VIEW.show })}
        >Reset to defaults</button
      >
    </div>
  {/if}
</div>
