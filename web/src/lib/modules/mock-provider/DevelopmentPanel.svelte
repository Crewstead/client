<script lang="ts">
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import ProviderToggle from './ProviderToggle.svelte';
  const workspace = useWorkspace();
  const enabled = $derived(
    workspace.catalog?.modules.find((item) => item.id === 'mock-provider')?.enabled ?? false,
  );
</script>

<section class="settings-section" aria-label="Test replies">
  <SettingsHeading page title="Test replies"
    >Made-up replies for trying the app without a real model. They cost nothing.</SettingsHeading
  >
  <div class="settings-card setting-lines">
    <ul>
      <li>
        <span class="project-text">
          <span class="row-name">Test models in chats</span>
          <span class="row-status"
            >{enabled ? 'On: “Test” models are offered in chats.' : 'Off.'} Turning them off keeps your
            chats.</span
          >
        </span>
        <ProviderToggle {enabled} />
      </li>
    </ul>
  </div>
</section>
