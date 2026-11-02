<script lang="ts">
  import ResizeHandle from './ResizeHandle.svelte';
  import { sidebarWidth } from '#lib/panel-widths.svelte.ts';
  import { resolve } from '$app/paths';
  import { ChevronLeft, MonitorPlay, Plus, Search } from '@lucide/svelte';
  import { page } from '$app/state';
  import { busy, useWorkspace } from '#lib/workspace.svelte.ts';
  import { notifier } from '#lib/notifications.svelte.ts';
  import ChatRow from './ChatRow.svelte';
  import PlaceRow from './PlaceRow.svelte';
  import { CLOUD, placesOf } from './sidebar-places.ts';
  import AccountMenu from './AccountMenu.svelte';
  import WorkspaceMenu from './WorkspaceMenu.svelte';
  import { activeModules } from '#lib/modules/registry.ts';
  let {
    open = false,
    close,
    openSearch,
  }: { open?: boolean; close: () => void; openSearch: () => void } = $props();
  const workspace = useWorkspace();
  const shortcut = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';
  // Shortcuts running modules add, e.g. to scheduled tasks.
  const links = $derived(
    activeModules(workspace.catalog?.modules).flatMap((module) => module.sidebarLinks ?? []),
  );
  let search = $state('');
  const sessions = $derived(workspace.sessions.filter((session) => !session.archived));
  const places = $derived(placesOf(sessions, workspace.catalog?.projects ?? []));
  /** With only the cloud there is nothing to choose between: its chats are the list. */
  const cloudOnly = $derived(places.length === 1);
  // The place whose chats show: the one chosen in the panel, else the open chat's (or the new chat's).
  let chosen = $state<string | null>();
  $effect(() => {
    void page.url.href;
    chosen = undefined;
    search = '';
  });
  const following = $derived.by(() => {
    const chat = sessions.find((session) => session.id === page.params.id);
    if (chat) return chat.projectId ?? CLOUD;
    if (page.url.pathname === '/new') return page.url.searchParams.get('project') ?? undefined;
    return undefined;
  });
  const shownId = $derived(cloudOnly ? CLOUD : chosen !== undefined ? chosen : following);
  const shown = $derived(places.find((place) => place.id === shownId));
  function choose(id: string | null) {
    chosen = id;
    search = '';
  }
  const words = $derived(search.trim().toLowerCase());
  const chats = $derived(
    (shown?.chats ?? []).filter((session) => session.title.toLowerCase().includes(words)),
  );
  const listed = $derived(
    places.filter((place) => `${place.name} ${place.machine ?? ''}`.toLowerCase().includes(words)),
  );
  // While a chat is dragged, the other places show above the chats, as places to drop it.
  let dragging = $state<{ id: string; from: string }>();
  let over = $state('');
  let moveError = $state('');
  // While any chat is working, the list checks back every few seconds, so its row changes when it ends;
  // with notifications on, now and then too, for replies the hub starts (scheduled tasks).
  $effect(() => {
    const working = workspace.sessions.some((session) => busy(session.status));
    if (!working && !notifier.on) return;
    const timer = setInterval(() => void workspace.refreshChats(), working ? 4_000 : 10_000);
    return () => clearInterval(timer);
  });
  $effect(() => {
    workspace.seen(page.params.id ?? '');
  });
  function dropZone(target: string) {
    return (node: HTMLElement) => {
      const allowed = () => dragging && dragging.from !== target;
      const enter = (event: DragEvent) => {
        if (!allowed()) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        over = target;
      };
      const leave = (event: DragEvent) => {
        if (!node.contains(event.relatedTarget as Node | null) && over === target) over = '';
      };
      const drop = async (event: DragEvent) => {
        if (!allowed() || !dragging) return;
        event.preventDefault();
        const chat = dragging.id;
        dragging = undefined;
        over = '';
        moveError = '';
        try {
          await workspace.move(chat, target === CLOUD ? null : target);
        } catch (cause) {
          moveError = cause instanceof Error ? cause.message : 'The chat could not be moved.';
        }
      };
      node.addEventListener('dragover', enter);
      node.addEventListener('dragleave', leave);
      node.addEventListener('drop', drop);
      return () => {
        node.removeEventListener('dragover', enter);
        node.removeEventListener('dragleave', leave);
        node.removeEventListener('drop', drop);
      };
    };
  }
  const dragOf = (session: (typeof sessions)[number]) => (started: boolean) => {
    dragging = started ? { id: session.id, from: session.projectId ?? CLOUD } : undefined;
    if (!started) over = '';
  };
</script>

{#if open}<button class="nav-scrim" aria-label="Close navigation" onclick={close}></button>{/if}
<aside class="sidebar" class:open id="navigation">
  <ResizeHandle panel={sidebarWidth} edge="right" label="Resize the sidebar" />
  <WorkspaceMenu {close} />
  <button class="sidebar-link sidebar-search-button" onclick={openSearch}
    ><Search size={15} />Search<kbd aria-hidden="true">{shortcut}</kbd></button
  >
  <a
    class="sidebar-link"
    class:active={page.url.pathname.startsWith('/browsers')}
    href={resolve('/browsers')}
    onclick={close}><MonitorPlay size={15} />Live browsers</a
  >
  {#each links as link (link.href)}
    {@const Icon = link.icon}
    <a
      class="sidebar-link"
      class:active={`${page.url.pathname}${page.url.search}` === link.href}
      href={resolve(link.href as '/')}
      onclick={close}><Icon size={15} />{link.label}</a
    >
  {/each}
  {#if shown && !cloudOnly}
    <div class="sessions-heading place-heading-open">
      <button
        class="place-back"
        aria-label="All projects"
        title="All projects"
        onclick={() => choose(null)}><ChevronLeft size={16} /></button
      >
      <h2 title={shown.machine ? `${shown.name} on ${shown.machine}` : shown.name}>
        {shown.name}{#if shown.machine}<small>{shown.machine}</small>{/if}
      </h2>
      <!-- eslint-disable svelte/no-navigation-without-resolve -- built with resolve() -->
      <a
        class="new-session"
        href={shown.id === CLOUD
          ? resolve('/new')
          : `${resolve('/new')}?project=${encodeURIComponent(shown.id)}`}
        onclick={close}
        aria-label={`New chat in ${shown.name}`}
        title={`New chat in ${shown.name}`}><Plus size={16} /></a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    </div>
  {:else}
    <div class="sessions-heading">
      <h2>{cloudOnly ? 'Chats' : 'Projects'}</h2>
      <a
        class="new-session"
        href={resolve('/new')}
        onclick={close}
        aria-label="New chat"
        title="New chat"><Plus size={16} /></a
      >
    </div>
  {/if}
  {#if (shown ? shown.chats.length : places.length) > 8}<div class="sidebar-search">
      <Search size={14} /><input
        aria-label={shown ? 'Search chats' : 'Search projects'}
        placeholder={shown ? `Search chats in ${shown.name}` : 'Search projects'}
        bind:value={search}
      />
    </div>{/if}
  <nav class="session-list" class:dragging aria-label="Chats">
    {#if moveError}<p class="chat-error" role="alert">{moveError}</p>{/if}
    {#if shown}
      {#if dragging && !cloudOnly}
        <section class="drop-places" aria-label="Move to">
          <p>Move to</p>
          {#each places.filter((place) => place.id !== shown.id) as place (place.id)}
            <PlaceRow {place} open={() => {}} over={over === place.id} drop={dropZone(place.id)} />
          {/each}
        </section>
      {/if}
      {#each chats as session (session.id)}
        <ChatRow
          {session}
          selected={page.params.id === session.id}
          {close}
          drag={dragOf(session)}
        />
      {:else}
        <p class="place-empty">{words ? 'No chats match.' : 'No chats here yet.'}</p>
      {/each}
    {:else}
      {#each listed as place (place.id)}
        <PlaceRow
          {place}
          open={() => choose(place.id)}
          over={over === place.id}
          drop={dropZone(place.id)}
        />
      {/each}
    {/if}
  </nav>
  <footer class="sidebar-footer">
    {#key open}<AccountMenu {close} />{/key}
  </footer>
</aside>
