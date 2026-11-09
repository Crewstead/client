<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import type { Component } from 'svelte';
  import { ArrowLeft, ChevronLeft } from '@lucide/svelte';
  import SettingsNav from '#lib/settings/SettingsNav.svelte';
  import { movedSections, settingsSections } from '#lib/settings/sections.ts';
  import { activeModules } from '#lib/modules/registry.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { useAuthentication } from '#lib/auth/auth.svelte.ts';
  import '@crewstead/ui/settings-tabs.css';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/settings-page.css';
  const workspace = useWorkspace();
  const auth = useAuthentication();
  // Tabs depend on which modules the hub runs, so wait for the catalog before choosing one.
  const tabs = $derived(
    workspace.catalog ? settingsSections(workspace.catalog.modules, auth.user?.owner) : [],
  );
  const asked = $derived(page.url.searchParams.get('tab') ?? '');
  const active = $derived(
    tabs.find((tab) => tab.id === (movedSections[asked] ?? asked))?.id ?? tabs[0]?.id ?? 'general',
  );
  // On a phone Settings opens with its list of sections; a section opens on its own page.
  const chosen = $derived(page.url.searchParams.has('tab'));
  const activeLabel = $derived(tabs.find((tab) => tab.id === active)?.label ?? 'Settings');
  // Every section's code loads with Settings, so opening one never waits for it.
  const loaded = $state<Record<string, Component>>({});
  $effect(() => {
    // The rows modules add to sections (search, the server browser…) load with them too.
    for (const module of activeModules(workspace.catalog?.modules))
      for (const panel of module.panels ?? []) void panel.load();
    for (const tab of tabs)
      if (!loaded[tab.id])
        void tab.load().then((module) => (loaded[tab.id] = module.default as Component));
  });
  // A section stays mounted once opened, so coming back to it shows its data at once.
  const visited = $state<Record<string, boolean>>({});
  $effect(() => {
    visited[active] = true;
  });
  async function change(id: string) {
    const query = new SvelteURLSearchParams(page.url.search);
    query.set('tab', id);
    await goto(resolve(`/settings?${query}`), { reset: false });
  }
</script>

<div class="page-container settings-page settings-columns" data-chosen={chosen}>
  <a class="back-link to-chat" href={resolve('/')}><ArrowLeft size={15} /> Back to chat</a>
  <a class="back-link to-sections" href={resolve('/settings')}><ChevronLeft size={16} /> Settings</a
  >
  <h1>
    <span class="settings-title">Settings</span><span class="section-title">{activeLabel}</span>
  </h1>
  <div class="settings-layout">
    <SettingsNav {tabs} {active} {change} />
    <div class="settings-panels">
      {#each tabs as tab (tab.id)}
        <div
          class="settings-panel"
          role="tabpanel"
          id={`settings-panel-${tab.id}`}
          aria-labelledby={`settings-tab-${tab.id}`}
          hidden={active !== tab.id}
          tabindex="0"
        >
          {#if (visited[tab.id] || active === tab.id) && loaded[tab.id]}{@const Section =
              loaded[tab.id]}<Section />{/if}
        </div>
      {/each}
    </div>
  </div>
</div>
