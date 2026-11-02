<script lang="ts">
  import { appUpdates } from './app-updates.svelte.ts';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/projects.css';
  $effect(() => appUpdates.follow());
  const state = $derived(appUpdates.state);
  const status = $derived(
    !state
      ? ''
      : !state.supported
        ? 'Updates install themselves in the Linux AppImage and on Windows; here, download new versions from github.com/Crewstead/client/releases.'
        : state.ready
          ? `Crewstead ${state.ready} is downloaded: restart to use it.`
          : state.downloading
            ? `Downloading Crewstead ${state.downloading}…`
            : state.checking
              ? 'Checking for updates…'
              : state.error
                ? `Could not check for updates: ${state.error}`
                : state.latest
                  ? 'This is the newest version.'
                  : 'Checked when the app starts and every 6 hours.',
  );
</script>

<!-- Only inside the desktop app: its version and updates. -->
{#if appUpdates.available && state}
  <section class="settings-section" aria-label="Desktop app">
    <h2>Desktop app</h2>
    <div class="settings-card setting-lines">
      <ul>
        <li aria-label="Updates">
          <span class="project-text">
            <span class="row-name">Crewstead {state.version}</span>
            <span class="row-status" role="status">{status}</span>
          </span>
          {#if state.ready}
            <button class="button primary small" onclick={() => appUpdates.restart()}
              >Restart now</button
            >
          {:else if state.supported}
            <button
              class="button subtle small"
              disabled={state.checking || !!state.downloading}
              onclick={() => appUpdates.check()}>Check for updates</button
            >
          {/if}
        </li>
      </ul>
    </div>
  </section>
{/if}
