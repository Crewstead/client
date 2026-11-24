<script lang="ts">
  import { Check, ChevronRight, ListFilter } from '@lucide/svelte';
  import { DEFAULT_LIST_VIEW, type ListView } from './list-view.ts';
  import Dropdown from './Dropdown.svelte';
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
  $effect(() => {
    if (!open) sub = null;
  });
  /** The item the pointer opened last, so the click that follows does not close it again. */
  let hovered = '';
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
    { key: 'side', label: 'Side chats' },
  ] as const;
  const plain = $derived(
    view.group === DEFAULT_LIST_VIEW.group &&
      view.sort === DEFAULT_LIST_VIEW.sort &&
      JSON.stringify(view.show) === JSON.stringify(DEFAULT_LIST_VIEW.show),
  );
  function pick(next: Partial<ListView>) {
    change({ ...view, ...next });
    open = false;
  }
</script>

<!-- How the list shows its chats, as in Claude Code: grouping, order, what shows, and sections. -->
<Dropdown
  class="list-menu"
  triggerClass="new-session {plain ? '' : 'active'}"
  role="menu"
  label={plain ? 'List options' : 'List options (changed)'}
  bind:open
>
  {#snippet trigger()}<ListFilter size={15} />{/snippet}
  {#snippet children(close)}
    {#each [{ id: 'group', label: 'Group by', value: groups.find((g) => g.value === view.group)?.label }, { id: 'sort', label: 'Sort by', value: sorts.find((s) => s.value === view.sort)?.label }, { id: 'show', label: 'Show', value: '' }] as const as item (item.id)}
      <div class="list-menu-item">
        <button
          class="menu-item"
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
          ><span class="menu-text"><span>{item.label}</span></span><span class="menu-value"
            >{item.value}</span
          ><ChevronRight size={14} /></button
        >
        {#if sub === item.id}
          <div class="dropdown-panel list-menu-sub" role="menu" aria-label={item.label}>
            {#if item.id === 'group'}
              {#each groups as choice (choice.value)}
                <button
                  class="menu-item"
                  role="menuitemradio"
                  aria-checked={view.group === choice.value}
                  onclick={() => pick({ group: choice.value })}
                  >{choice.label}{#if view.group === choice.value}<Check
                      class="menu-check"
                      size={14}
                    />{/if}</button
                >
              {/each}
            {:else if item.id === 'sort'}
              {#each sorts as choice (choice.value)}
                <button
                  class="menu-item"
                  role="menuitemradio"
                  aria-checked={view.sort === choice.value}
                  onclick={() => pick({ sort: choice.value })}
                  >{choice.label}{#if view.sort === choice.value}<Check
                      class="menu-check"
                      size={14}
                    />{/if}</button
                >
              {/each}
            {:else}
              {#each shows as choice (choice.key)}
                <button
                  class="menu-item"
                  role="menuitemcheckbox"
                  aria-checked={view.show[choice.key]}
                  onclick={() =>
                    change({
                      ...view,
                      show: { ...view.show, [choice.key]: !view.show[choice.key] },
                    })}
                  >{choice.label}{#if view.show[choice.key]}<Check
                      class="menu-check"
                      size={14}
                    />{/if}</button
                >
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    {/each}
    <hr class="menu-separator" />
    <button
      class="menu-item"
      role="menuitem"
      onpointerenter={() => (sub = null)}
      onclick={() => {
        close();
        addSection();
      }}>New section</button
    >
    <hr class="menu-separator" />
    <button
      class="menu-item"
      role="menuitem"
      disabled={plain}
      onpointerenter={() => (sub = null)}
      onclick={() => pick({ group: 'none', sort: 'updated', show: DEFAULT_LIST_VIEW.show })}
      >Reset to defaults</button
    >
  {/snippet}
</Dropdown>
