<script lang="ts">
  import { Download } from '@lucide/svelte';
  import { appUpdates } from './app-updates.svelte.ts';
  import '@crewstead/ui/update-bar.css';
  $effect(() => appUpdates.follow());
  const ready = $derived(appUpdates.state?.ready);
</script>

<!-- In the desktop app: a new version is downloaded and installs on restart. -->
{#if ready && appUpdates.dismissed !== ready}
  <div class="update-bar" role="status">
    <Download size={15} aria-hidden="true" />
    <span title="It also installs the next time Crewstead quits."
      >Crewstead {ready} is ready to install.</span
    >
    <span class="update-actions">
      <button class="button primary small" onclick={() => appUpdates.restart()}>Restart now</button>
      <button class="button subtle small" onclick={() => (appUpdates.dismissed = ready)}
        >Later</button
      >
    </span>
  </div>
{/if}
