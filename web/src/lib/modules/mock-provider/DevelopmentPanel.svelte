<script lang="ts">
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import ProviderToggle from './ProviderToggle.svelte';
  const workspace = useWorkspace();
  const enabled = $derived(
    workspace.catalog?.modules.find((item) => item.id === 'mock-provider')?.enabled ?? false,
  );
</script>

<section class="settings-section" aria-label="Test replies">
  <h2>Development</h2>
  <div class="settings-card setting-row">
    <div>
      <strong>Test replies</strong>
      <p>
        Free made-up replies for trying the app, without a real model. Turning them off keeps your
        chats.
      </p>
    </div>
    <ProviderToggle {enabled} />
  </div>
</section>
