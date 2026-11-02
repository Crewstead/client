<script lang="ts">
  import UpdateBar from '#lib/desktop/UpdateBar.svelte';
  import { onMount, onDestroy, setContext } from 'svelte';
  import type { Snippet } from 'svelte';
  import { Workspace } from '#lib/workspace.svelte.ts';
  import { useAuthentication } from '#lib/auth/auth.svelte.ts';
  import Sidebar from './Sidebar.svelte';
  import SearchDialog from './SearchDialog.svelte';
  import { chatPanelWidth, sidebarWidth } from '#lib/panel-widths.svelte.ts';
  import { Menu } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  let { children }: { children: Snippet } = $props();
  const workspace = setContext('workspace', new Workspace(useAuthentication().scope));
  let navigationOpen = $state(false);
  let searching = $state(false);
  onMount(() => {
    sidebarWidth.load();
    chatPanelWidth.load();
    void workspace.initialize();
  });
  onDestroy(() => workspace.dispose());
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && !document.querySelector('[popover]:popover-open'))
      navigationOpen = false;
    // Ctrl+K (⌘K on a Mac) searches every chat.
    if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey) {
      event.preventDefault();
      navigationOpen = false;
      searching = true;
    }
  }}
/>
<div class="app-shell">
  <Sidebar
    open={navigationOpen}
    close={() => (navigationOpen = false)}
    openSearch={() => {
      navigationOpen = false;
      searching = true;
    }}
  />
  {#if searching}<SearchDialog close={() => (searching = false)} />{/if}
  <div class="main-shell">
    <header class="mobile-header">
      <button
        class="icon-button"
        aria-label="Open navigation"
        aria-expanded={navigationOpen}
        aria-controls="navigation"
        onclick={() => (navigationOpen = !navigationOpen)}><Menu size={20} /></button
      ><a href={resolve('/')}>Crewstead</a>
    </header>
    <UpdateBar />
    <main id="main">{@render children()}</main>
  </div>
</div>
