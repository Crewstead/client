<script lang="ts">
  import {
    ArrowLeft,
    ArrowRight,
    ExternalLink,
    MonitorPlay,
    MousePointer2,
    RotateCw,
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type { LiveControl, LiveEvent, LiveInput } from '@crewstead/core/protocol';
  import { request } from '#lib/api.ts';
  import {
    LiveBrowsers,
    liveId as id,
    tabQuery,
    liveSources,
    pageName,
    type Watchable,
  } from '#lib/live-browsers.svelte.ts';
  import { activeModules } from '#lib/modules/registry.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import LiveScreen from './LiveScreen.svelte';
  import LiveTabs from './LiveTabs.svelte';
  import '@crewstead/ui/live-browser.css';
  const workspace = useWorkspace();
  const live = new LiveBrowsers();
  const bases = $derived(liveSources(activeModules(workspace.catalog?.modules)));
  const basesKey = $derived(bases.join());
  // New sessions show up while this page is open.
  $effect(() => {
    void basesKey;
    void live.refresh(bases);
    const timer = setInterval(() => void live.refresh(bases), 4_000);
    return () => clearInterval(timer);
  });
  // Opening from a chat shows the session it picked (?session=<id>), else that chat's (?chat=<id>).
  let chosen = $state(page.url.searchParams.get('session') ?? '');
  const wanted = $derived(page.url.searchParams.get('chat'));
  // The tab shown is kept by its id, so refreshing the list never switches it or restarts its stream.
  const selectedId = $derived.by(() => {
    if (live.sessions.some((session) => id(session) === chosen)) return chosen;
    const fallback = live.sessions.find((session) => session.chatId === wanted) ?? live.sessions[0];
    return fallback ? id(fallback) : '';
  });
  const selected = $derived(live.sessions.find((session) => id(session) === selectedId));
  const selectedBase = $derived(selected?.base ?? '');
  const selectedKey = $derived(selected?.key ?? '');
  const selectedTab = $derived(selected?.tab);
  let pages = $state<Record<string, Extract<LiveEvent, { type: 'page' }>>>({});
  const chatTitle = (session: Watchable) =>
    workspace.sessions.find((chat) => chat.id === session.chatId)?.title;
  const names = (session: Watchable) => {
    const current = pages[id(session)];
    const url = current?.url ?? session.url;
    return { title: pageName(current?.title || session.title, url), chat: chatTitle(session), url };
  };
  let error = $state('');
  let controlling = $state(false);
  /** The desktop app shows its real tab, which takes clicks and keys itself: no control to take. */
  let direct = $state(false);
  $effect(() => {
    // Control is per session: switching tabs hands it back.
    void selectedId;
    controlling = false;
  });
  /** Inputs go one after another, so the page gets them in order. */
  let sending = Promise.resolve();
  function send(session: Watchable, input: LiveInput) {
    sending = sending.then(() =>
      request(`${session.base}/${encodeURIComponent(session.key)}/input${tabQuery(session)}`, {
        method: 'POST',
        body: JSON.stringify(input),
      }).then(
        () => undefined,
        (cause: unknown) => {
          error = cause instanceof Error ? cause.message : 'The browser did not take that.';
        },
      ),
    );
  }
  async function control(session: Watchable, action: LiveControl) {
    error = '';
    try {
      await live.control(session, action);
      if (action === 'close') await live.refresh(bases);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That did not work.';
    }
  }
</script>

<section class="live-browsers" aria-label="Live browsers">
  <header class="live-header">
    <h1><MonitorPlay size={16} /> Live browsers</h1>
    <p>Every chat’s browser session, as the model uses it.</p>
  </header>
  {#if live.sessions.length}
    <!-- One browser window: its tabs on top, then the address bar, then the page. -->
    <div class="live-window">
      <LiveTabs
        sessions={live.sessions}
        selected={selectedId}
        select={(next) => (chosen = next)}
        close={(session) => control(session, 'close')}
        {names}
      />
      {#if selected}
        {@const state = pages[id(selected)]}
        <div class="live-toolbar" role="toolbar" aria-label="Browser controls">
          <button class="icon-button" aria-label="Back" onclick={() => control(selected, 'back')}
            ><ArrowLeft size={16} /></button
          >
          <button
            class="icon-button"
            aria-label="Forward"
            onclick={() => control(selected, 'forward')}><ArrowRight size={16} /></button
          >
          <button
            class="icon-button"
            aria-label="Reload"
            onclick={() => control(selected, 'reload')}><RotateCw size={15} /></button
          >
          <span class="live-address" title={state?.url ?? selected.url}
            >{state?.url ?? selected.url}</span
          >

          {#if !direct}<button
              class="button small"
              class:primary={controlling}
              class:subtle={!controlling}
              aria-pressed={controlling}
              title="Click, scroll and type in the page yourself"
              onclick={() => (controlling = !controlling)}
              ><MousePointer2 size={13} />{controlling ? 'Stop control' : 'Take control'}</button
            >{/if}
          <button
            class="button subtle small"
            onclick={() => goto(resolve('/sessions/[id]', { id: selected.chatId }))}
            ><ExternalLink size={13} /> Open chat</button
          >
        </div>
        {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
        {#key selectedId}
          <LiveScreen
            base={selectedBase}
            sessionKey={selectedKey}
            tab={selectedTab}
            onpage={(event) => (pages[selectedId] = event)}
            onclosed={() => void live.refresh(bases)}
            control={controlling}
            fill
            onembedded={(on) => (direct = on)}
            send={(input) => selected && send(selected, input)}
          />
          {#if controlling}<p class="live-note">
              You’re in control: clicks, scrolling and typing go to the page. The model is told you
              used the browser before it acts again.
            </p>{/if}
        {/key}
      {/if}
    </div>
  {:else if live.loaded}
    <div class="live-empty">
      <MonitorPlay size={28} />
      <strong>No browser is open</strong>
      <span
        >A chat’s browser shows here while the model uses it: on your computer for a project, or on
        the server for public websites.</span
      >
      <a class="button subtle small" href={resolve('/new')}>New chat</a>
    </div>
  {/if}
</section>
