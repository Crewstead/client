<script lang="ts">
  import PanelSection from './PanelSection.svelte';
  import { Globe, Maximize2 } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import type { LiveEvent, Session } from '@crewstead/core/protocol';
  import {
    LiveBrowsers,
    liveId,
    liveSources,
    pageName,
    type Watchable,
  } from '#lib/live-browsers.svelte.ts';
  import { activeModules } from '#lib/modules/registry.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import LiveScreen from '../live/LiveScreen.svelte';
  import LiveTabs from '../live/LiveTabs.svelte';
  import { browserState } from './chat-facts.ts';
  let { session }: { session: Session } = $props();
  const workspace = useWorkspace();
  const live = new LiveBrowsers();
  const bases = $derived(liveSources(activeModules(workspace.catalog?.modules)));
  const basesKey = $derived(bases.join());
  // Read while the panel is open, so a browser the model opens shows up here.
  $effect(() => {
    void basesKey;
    void live.refresh(bases);
    const timer = setInterval(() => void live.refresh(bases), 4_000);
    return () => clearInterval(timer);
  });
  const open = $derived(live.sessions.filter((entry) => entry.chatId === session.id));
  let chosen = $state('');
  const selectedId = $derived(
    open.some((entry) => liveId(entry) === chosen) ? chosen : open[0] ? liveId(open[0]) : '',
  );
  const selected = $derived(open.find((entry) => liveId(entry) === selectedId));
  const selectedBase = $derived(selected?.base ?? '');
  const selectedKey = $derived(selected?.key ?? '');
  const selectedTab = $derived(selected?.tab);
  let pages = $state<Record<string, Extract<LiveEvent, { type: 'page' }>>>({});
  const names = (entry: Watchable) => {
    const current = pages[liveId(entry)];
    const url = current?.url ?? entry.url;
    return { title: pageName(current?.title || entry.title, url), url };
  };
  // Once the chat's browsers have closed, what they last showed.
  const used = $derived(
    [browserState(session, 'browser'), browserState(session, 'web')].filter((state) => state),
  );
</script>

{#if open.length || used.length}
  <PanelSection
    id="browsers"
    label="Browsers"
    icon={Globe}
    count={open.length ? `${open.length} open` : undefined}
  >
    {#if open.length}
      <!-- A small browser window: the chat's sessions as tabs in a slim bar on top of the page. -->
      <div class="panel-live">
        <div class="panel-live-tabs">
          <LiveTabs
            sessions={open}
            selected={selectedId}
            select={(next) => (chosen = next)}
            {names}
            compact
          />
        </div>
        {#key selectedId}
          <a
            class="panel-live-link"
            href={resolve(`/browsers?session=${encodeURIComponent(selectedId)}`)}
            title="Open in full view, to watch or take control"
            aria-label="Open this browser in full view"
          >
            <LiveScreen
              base={selectedBase}
              sessionKey={selectedKey}
              tab={selectedTab}
              onpage={(event) => (pages[selectedId] = event)}
              onclosed={() => void live.refresh(bases)}
              send={() => {}}
            />
            <span class="panel-live-open" aria-hidden="true"><Maximize2 size={14} /></span>
          </a>
        {/key}
      </div>
    {:else}
      <p class="panel-empty">
        No browser open now. {#each used as state, index (index)}{#if state?.url}Last page:
            <code>{state.url}</code>{/if}{/each}
      </p>
    {/if}
  </PanelSection>
{/if}
