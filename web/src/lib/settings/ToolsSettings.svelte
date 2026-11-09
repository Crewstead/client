<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import EmptyState from '#lib/components/EmptyState.svelte';
  import ModuleSlot from '#lib/modules/ModuleSlot.svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { activeModules, panelsFor } from '#lib/modules/registry.ts';
  import '@crewstead/ui/projects.css';
  const workspace = useWorkspace();
  const rows = $derived(panelsFor(activeModules(workspace.catalog?.modules), 'tools').length);
</script>

<!-- Tools the hub itself gives chats, one row each; optional modules add their rows. -->
<section class="settings-section" aria-label="Built-in tools">
  <SettingsHeading page title="Built-in tools"
    >Tools this hub gives every chat, without a project or a computer.</SettingsHeading
  >
  {#if rows}
    <div class="settings-card setting-lines">
      <ul>
        <ModuleSlot slot="tools" props={{}}>
          {#snippet pending()}<li aria-busy="true">
              <span class="project-text"
                ><span class="loading-bar"></span><span class="loading-bar short"></span></span
              ><span class="loading-bar control" aria-hidden="true"></span>
            </li>{/snippet}
        </ModuleSlot>
      </ul>
    </div>
  {:else}
    <EmptyState text="This hub runs no built-in tools." />
  {/if}
</section>
