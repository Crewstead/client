<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import { siteData, type SiteCount } from '#lib/desktop/site-data.ts';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/projects.css';
  import '@crewstead/ui/site-data.css';
  const plural = (count: number) => (count === 1 ? '1 cookie' : `${count} cookies`);
  const reason = (cause: unknown) =>
    (cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking[^:]*: /, '');

  let kept = $state<SiteCount[]>();
  let error = $state('');
  async function refresh() {
    try {
      kept = await siteData.kept();
    } catch (cause) {
      error = reason(cause);
    }
  }
  async function remove(site: string) {
    error = '';
    await siteData.remove(site).catch((cause) => (error = reason(cause)));
    await refresh();
  }

  let sources = $state<{ id: string; label: string }[]>([]);
  let source = $state('');
  let sites = $state<SiteCount[]>();
  let filter = $state('');
  let chosen = $state<string[]>([]);
  let busy = $state(false);
  let note = $state('');
  const shown = $derived(
    (sites ?? []).filter((entry) => entry.site.includes(filter.trim().toLowerCase())),
  );
  async function pick(id: string) {
    source = id;
    sites = undefined;
    chosen = [];
    note = '';
    error = '';
    if (!id) return;
    try {
      sites = await siteData.sites(id);
    } catch (cause) {
      error = reason(cause);
    }
  }
  async function bring() {
    busy = true;
    note = '';
    error = '';
    try {
      const done = await siteData.import(source, chosen);
      if (!done.cancelled) {
        note =
          `Imported ${plural(done.imported)}` +
          (done.skipped ? `; ${plural(done.skipped)} could not be read and were left out.` : '.');
        chosen = [];
        await refresh();
      }
    } catch (cause) {
      error = reason(cause);
    } finally {
      busy = false;
    }
  }
  $effect(() => {
    void refresh();
    void siteData.sources().then(
      (found) => (sources = found),
      () => (sources = []),
    );
  });
</script>

<!-- The desktop app's own browser: the sites it keeps data for, and importing sign-ins into it. -->
<section class="settings-section" aria-label="Sites in Crewstead's browser">
  <SettingsHeading title="Crewstead's browser">
    Chats on this computer browse in it, in the panel beside the chat. It keeps its own sign-ins,
    apart from your other browsers.
  </SettingsHeading>
  {#if error}<p class="row-error" role="alert">{error}</p>{/if}
  <div class="settings-card setting-lines">
    <ul>
      {#each kept ?? [] as entry (entry.site)}
        <li aria-label={entry.site}>
          <span class="project-text">
            <span class="row-name">{entry.site}</span>
            <span class="row-status">{plural(entry.cookies)}</span>
          </span>
          <button class="button subtle small" onclick={() => remove(entry.site)}>Remove</button>
        </li>
      {:else}
        <li>
          <span class="row-status"
            >{kept ? 'No sites yet. Sign in there, or import sign-ins below.' : 'Loading…'}</span
          >
        </li>
      {/each}
    </ul>
  </div>
</section>

<section class="settings-section" aria-label="Import sign-ins">
  <SettingsHeading title="Import from another browser">
    Copy chosen sites' cookies, sign-ins included, from a browser on this computer. They stay on
    this computer; Crewstead asks before each import.
  </SettingsHeading>
  <div class="settings-card site-import">
    {#if sources.length}
      <label class="site-import-source">
        <span>From</span>
        <select value={source} onchange={(event) => pick(event.currentTarget.value)}>
          <option value="">Choose a browser…</option>
          {#each sources as entry (entry.id)}<option value={entry.id}>{entry.label}</option>{/each}
        </select>
      </label>
    {:else}
      <p class="row-status">No Chrome, Chromium, Edge, Brave or Vivaldi profile found here.</p>
    {/if}
    {#if sites}
      <input type="search" placeholder="Find a site" aria-label="Find a site" bind:value={filter} />
      <ul class="site-import-list" aria-label="Sites to import">
        {#each shown as entry (entry.site)}
          <li>
            <label>
              <input type="checkbox" value={entry.site} bind:group={chosen} />
              <span>{entry.site}</span>
              <span class="row-status">{plural(entry.cookies)}</span>
            </label>
          </li>
        {:else}<li class="row-status">No sites match.</li>{/each}
      </ul>
      <div class="site-import-actions">
        {#if note}<span class="row-status" role="status">{note}</span>{/if}
        <button class="button primary" disabled={busy || !chosen.length} onclick={bring}
          >{chosen.length > 1 ? `Import ${chosen.length} sites` : 'Import'}</button
        >
      </div>
    {/if}
  </div>
</section>
