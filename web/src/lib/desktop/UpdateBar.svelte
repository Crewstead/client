<script lang="ts">
  import { Download, X } from '@lucide/svelte';
  import { appUpdates } from './app-updates.svelte.ts';
  import '@crewstead/ui/update-bar.css';
  $effect(() => appUpdates.follow());
  const ready = $derived(appUpdates.state?.ready);
</script>

<!-- In the desktop app, at the foot of the left panel: a new version is downloaded and installs on
     restart (or the next time Crewstead quits). -->
{#if ready && appUpdates.dismissed !== ready}
  <div class="update-chip" role="status">
    <button
      class="update-install"
      title="Restart Crewstead to install it. It also installs the next time Crewstead quits."
      onclick={() => appUpdates.restart()}
      ><Download size={14} aria-hidden="true" /><span>Update to {ready}</span></button
    ><button
      class="icon-button update-later"
      aria-label="Later"
      title="Later"
      onclick={() => (appUpdates.dismissed = ready)}><X size={13} /></button
    >
  </div>
{/if}
