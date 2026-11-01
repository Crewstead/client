<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { ArrowLeft } from '@lucide/svelte';
  import { activeModules } from '#lib/modules/registry.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import '@crewstead/ui/settings-tabs.css';
  const workspace = useWorkspace();
  // A module's own page, e.g. /settings/organisations/<id>, shown only while that module runs.
  const target = $derived(
    workspace.catalog
      ? (activeModules(workspace.catalog.modules)
          .flatMap((module) => module.pages ?? [])
          .find((candidate) => candidate.section === page.params.section) ?? null)
      : undefined,
  );
</script>

{#if target}
  {#key page.params.id}
    {#await target.load() then loaded}<loaded.default id={page.params.id!} />{/await}
  {/key}
{:else if target === null}
  <div class="page-container settings-page">
    <a class="back-link" href={resolve('/settings')}><ArrowLeft size={15} /> Settings</a>
    <h1>Not available</h1>
    <p class="muted-text">This part of Settings is turned off on this server.</p>
  </div>
{/if}
