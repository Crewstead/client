<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { ArrowLeft } from '@lucide/svelte';
  import SettingsTabs from '#lib/settings/SettingsTabs.svelte';
  import { settingsSections } from '#lib/settings/sections.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { useAuthentication } from '#lib/auth/auth.svelte.ts';
  import '@crewstead/ui/settings-tabs.css';
  const workspace = useWorkspace();
  const auth = useAuthentication();
  // Tabs depend on which modules the hub runs, so wait for the catalog before choosing one.
  const tabs = $derived(
    workspace.catalog ? settingsSections(workspace.catalog.modules, auth.user?.owner) : [],
  );
  const active = $derived(
    tabs.find((tab) => tab.id === page.url.searchParams.get('tab'))?.id ?? 'models',
  );
  async function change(id: string) {
    const query = new SvelteURLSearchParams(page.url.search);
    query.set('tab', id);
    await goto(resolve(`/settings?${query}`), { reset: false });
  }
</script>

<div class="page-container settings-page">
  <a class="back-link" href={resolve('/')}><ArrowLeft size={15} /> Back to chat</a>
  <h1>Settings</h1>
  <SettingsTabs {tabs} {active} {change} />
  {#each tabs as tab (tab.id)}
    <div
      class="settings-panel"
      role="tabpanel"
      id={`settings-panel-${tab.id}`}
      aria-labelledby={`settings-tab-${tab.id}`}
      hidden={active !== tab.id}
      tabindex="0"
    >
      {#if active === tab.id}{#await tab.load() then loaded}<loaded.default />{/await}{/if}
    </div>
  {/each}
</div>
