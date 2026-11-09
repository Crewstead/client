<script lang="ts">
  import { ChevronRight } from '@lucide/svelte';
  import type { SettingsTab } from '#lib/modules/types.ts';
  import { settingsGroups } from './sections.ts';
  let {
    tabs,
    active,
    change,
  }: {
    tabs: SettingsTab[];
    active: string;
    change: (id: string) => Promise<void>;
  } = $props();
  const groups = $derived(
    settingsGroups
      .map((group) => ({ ...group, tabs: tabs.filter((tab) => tab.group === group.id) }))
      .filter((group) => group.tabs.length),
  );
  function keydown(event: KeyboardEvent, id: string) {
    const index = tabs.findIndex((tab) => tab.id === id);
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    document.getElementById(`settings-tab-${tabs[next].id}`)?.focus();
    void change(tabs[next].id);
  }
</script>

<!-- Settings sections in a column, under their groups; on a phone, the list Settings opens with. -->
<nav class="settings-nav" aria-label="Settings">
  <div role="tablist" aria-orientation="vertical" aria-label="Settings categories">
    {#each groups as group (group.id)}
      <!-- A group of one section is named by that section; only larger groups get a label. -->
      {#if group.tabs.length > 1}<p class="settings-nav-group" role="presentation">
          {group.label}
        </p>{:else}<span class="settings-nav-gap" role="presentation"></span>{/if}
      {#each group.tabs as tab (tab.id)}
        <button
          class="settings-tab"
          role="tab"
          id={`settings-tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`settings-panel-${tab.id}`}
          tabindex={active === tab.id ? 0 : -1}
          onclick={() => change(tab.id)}
          onkeydown={(event) => keydown(event, tab.id)}
          >{tab.label}<ChevronRight size={16} aria-hidden="true" /></button
        >
      {/each}
    {/each}
  </div>
</nav>
