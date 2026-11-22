<script lang="ts">
  import ResizeHandle from './ResizeHandle.svelte';
  import { sidebarWidth } from '#lib/panel-widths.svelte.ts';
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { LoaderCircle, MonitorPlay, Plus, Search } from '@lucide/svelte';
  import { page } from '$app/state';
  import { busy, useWorkspace } from '#lib/workspace.svelte.ts';
  import { notifier } from '#lib/notifications.svelte.ts';
  import ChatRow from './ChatRow.svelte';
  import ProjectRail from './ProjectRail.svelte';
  import ListMenu from './ListMenu.svelte';
  import ChatBlocks from './ChatBlocks.svelte';
  import { SideFolds } from './side-folds.svelte.ts';
  import type { ChatSummary } from '#lib/api.ts';
  import { ago } from './plan-usage.ts';
  import {
    DEFAULT_LIST_VIEW,
    arrange,
    moveToSection,
    type ListSection,
    type ListView,
  } from './list-view.ts';
  import {
    CLOUD,
    chatOrder,
    lastChat,
    placesOf,
    rearranged,
    rememberChat,
  } from './sidebar-places.ts';
  import { PlaceReorder } from './place-reorder.svelte.ts';
  import AccountMenu from './AccountMenu.svelte';
  import UpdateBar from '#lib/desktop/UpdateBar.svelte';
  import WorkspaceMenu from './WorkspaceMenu.svelte';
  import { activeModules } from '#lib/modules/registry.ts';
  import '@crewstead/ui/sidebar-places.css';
  let {
    open = false,
    close,
    openSearch,
  }: { open?: boolean; close: () => void; openSearch: () => void } = $props();
  const workspace = useWorkspace();
  const shortcut = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘ + K' : 'Ctrl + K';
  // Shortcuts running modules add, e.g. to scheduled tasks.
  const links = $derived(
    activeModules(workspace.catalog?.modules).flatMap((module) => module.sidebarLinks ?? []),
  );
  let search = $state('');
  const sessions = $derived(workspace.sessions.filter((session) => !session.archived));
  const places = $derived(
    placesOf(
      sessions,
      workspace.catalog?.projects ?? [],
      workspace.catalog?.preferences.placeOrder,
      workspace.catalog?.preferences.pinnedOrder,
    ),
  );
  // Places move among their own computer's; the saved order is the whole list.
  const reorder = new PlaceReorder((ids) => {
    const order = rearranged(
      places.map((place) => place.id),
      ids,
    );
    void workspace.setPlaceOrder(order).catch(() => {
      moveError = 'The new order could not be saved.';
    });
  });
  /** With only the cloud there is nothing to choose between: its chats are the list. */
  const cloudOnly = $derived(workspace.ready && places.length === 1);
  // The place whose chats show: the one picked in the projects bar, which follows the open chat (or
  // the new chat's place) and stays on other pages; the cloud at first.
  let chosen = $state(CLOUD);
  const following = $derived.by(() => {
    // Archived ones too: archiving the open chat keeps its place's chats showing.
    const chat = workspace.sessions.find((session) => session.id === page.params.id);
    if (chat) return chat.projectId ?? CLOUD;
    if (page.url.pathname === '/new') return page.url.searchParams.get('project') ?? undefined;
    return undefined;
  });
  $effect(() => {
    void page.url.href;
    search = '';
    const place = following;
    if (place !== undefined) chosen = place;
  });
  // A place that went away (its last chat archived, its computer removed) gives way to the cloud.
  const shown = $derived(
    places.find((place) => place.id === (cloudOnly ? CLOUD : chosen)) ??
      places.find((place) => place.id === CLOUD),
  );
  function choose(id: string) {
    chosen = id;
    search = '';
  }
  // The open chat is remembered for its place, so choosing that place again goes back to it.
  $effect(() => {
    const chat = page.params.id;
    const place = following;
    if (chat && place) rememberChat(workspace.context, place, chat);
  });
  /** A tile opens its place's chat open last here, else its first chat, else a new chat there. */
  function openPlace(id: string) {
    choose(id);
    const place = places.find((entry) => entry.id === id);
    if (!place) return;
    const chats = arrange(place.chats, view, {
      pinnedOrder: workspace.catalog?.preferences.pinnedOrder,
      modelLabel,
    }).flatMap((block) => block.chats);
    const remembered = lastChat(workspace.context, id);
    const target = chats.find((chat) => chat.id === remembered) ?? chats[0];
    if (target) {
      if (target.id !== page.params.id) void goto(resolve('/sessions/[id]', { id: target.id }));
    } else {
      const href = `${resolve('/new')}${id === CLOUD ? '' : `?project=${encodeURIComponent(id)}`}`;
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- built with resolve()
      void goto(href);
    }
  }
  const words = $derived(search.trim().toLowerCase());
  const matching = $derived(
    (shown?.chats ?? []).filter((session) => session.title.toLowerCase().includes(words)),
  );
  // Pinned chats move by dragging one over another (or Alt with the arrows); `pinLive` is the order
  // shown while dragging.
  let pinLive = $state<string[] | null>(null);
  const pinnedIds = $derived(matching.filter((chat) => chat.pinned).map((chat) => chat.id));
  // How the list shows its chats (its options menu): pinned, sections, then groups.
  const view = $derived(workspace.catalog?.preferences.listView ?? DEFAULT_LIST_VIEW);
  const modelLabel = (id: string) =>
    workspace.catalog?.models.find((model) => model.id === id)?.label ?? 'Other models';
  const blocks = $derived.by(() => {
    const arranged = arrange(matching, view, {
      pinnedOrder: workspace.catalog?.preferences.pinnedOrder,
      modelLabel,
    });
    const live = pinLive;
    if (!live) return arranged;
    return arranged.map((block) =>
      block.key === 'pinned'
        ? { ...block, chats: live.flatMap((id) => block.chats.filter((chat) => chat.id === id)) }
        : block,
    );
  });
  const empty = $derived(blocks.every((block) => !block.chats.length) && !view.sections.length);
  // Side chats show under their chat, which folds them away (remembered on this device).
  const folds = new SideFolds();
  const sidesOf = (id: string) =>
    view.show.side ? workspace.sideChats.filter((chat) => chat.parent?.id === id) : [];
  const sideOf = (id: string) => (folds.folded.has(id) ? [] : sidesOf(id));
  const meta = (chat: ChatSummary) =>
    view.show.metadata
      ? `${modelLabel(chat.modelId)} · ${ago(chat.lastMessageAt ?? chat.createdAt)}`
      : undefined;
  let naming = $state(false);
  function saveView(next: ListView) {
    void workspace.setListView(next).catch(() => {
      moveError = 'The list options could not be saved.';
    });
  }
  function nameSection(text: string | null) {
    naming = false;
    if (text)
      saveView({
        ...view,
        sections: [...view.sections, { id: crypto.randomUUID(), name: text, chats: [] }],
      });
  }
  const renameSection = (section: ListSection, name: string) =>
    saveView({
      ...view,
      sections: view.sections.map((entry) =>
        entry.id === section.id ? { ...entry, name } : entry,
      ),
    });
  const removeSection = (section: ListSection) =>
    saveView({ ...view, sections: view.sections.filter((entry) => entry.id !== section.id) });
  /** Saves `local` (pinned chats shown here) into the workspace's order of every pinned chat. */
  function savePinned(local: string[], id: string) {
    const all = chatOrder(
      sessions.filter((chat) => chat.pinned && chat.id !== id),
      workspace.catalog?.preferences.pinnedOrder,
    ).map((chat) => chat.id);
    const at = local.indexOf(id);
    const next = all.indexOf(local[at + 1] ?? '');
    const previous = all.indexOf(local[at - 1] ?? '');
    all.splice(next >= 0 ? next : previous >= 0 ? previous + 1 : all.length, 0, id);
    void workspace.setPinnedOrder(all).catch(() => {
      moveError = 'The new order could not be saved.';
    });
  }
  function pinOver(id: string) {
    const moving = dragging?.id;
    if (!moving || moving === id || !pinnedIds.includes(moving)) return;
    // It takes the place of the chat it is over: below it when coming from above.
    const current = pinLive ?? pinnedIds;
    const down = current.indexOf(moving) < current.indexOf(id);
    const order = current.filter((chat) => chat !== moving);
    order.splice(order.indexOf(id) + (down ? 1 : 0), 0, moving);
    if (order.join() !== pinLive?.join()) pinLive = order;
  }
  function pinKey(event: KeyboardEvent, id: string) {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    const at = pinnedIds.indexOf(id);
    if (!event.altKey || !step || at + step < 0 || at + step >= pinnedIds.length) return;
    event.preventDefault();
    const order = pinnedIds.filter((chat) => chat !== id);
    order.splice(at + step, 0, id);
    savePinned(order, id);
  }
  // A chat dragged onto a tile in the projects bar moves there.
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
    if (started) return;
    over = '';
    if (pinLive && pinLive.join() !== pinnedIds.join()) savePinned(pinLive, session.id);
    pinLive = null;
  };
</script>

{#snippet chatRow(session: ChatSummary, side: boolean, last: boolean)}
  {@const sides = side ? 0 : sidesOf(session.id).length}
  <ChatRow
    {session}
    {side}
    {last}
    fold={sides
      ? {
          count: sides,
          open: !folds.folded.has(session.id),
          toggle: () => folds.toggle(session.id),
        }
      : undefined}
    selected={page.params.id === session.id}
    {close}
    meta={meta(session)}
    sections={view.sections.map((section) => {
      const has = section.chats.includes(session.id);
      return {
        name: section.name,
        has,
        run: () => saveView(moveToSection(view, session.id, has ? undefined : section.id)),
      };
    })}
    {...side ? {} : { drag: dragOf(session) }}
    {...session.pinned && !side
      ? {
          reorder: {
            over: () => pinOver(session.id),
            key: (event: KeyboardEvent) => pinKey(event, session.id),
          },
        }
      : {}}
  />
{/snippet}

{#if open}<button class="nav-scrim" aria-label="Close navigation" onclick={close}></button>{/if}
<aside class="sidebar" class:open class:has-rail={!cloudOnly && workspace.ready} id="navigation">
  <ResizeHandle panel={sidebarWidth} edge="right" label="Resize the sidebar" />
  {#if !cloudOnly && workspace.ready}<ProjectRail
      {places}
      chosen={shown?.id ?? CLOUD}
      choose={openPlace}
      {over}
      drop={dropZone}
      {reorder}
      added={choose}
      problem={(text) => (moveError = text)}
      {close}
    />{/if}
  <div class="sidebar-main">
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
    <div class="sessions-heading place-heading-open">
      <h2 title={shown?.machine ? `${shown.name} on ${shown.machine}` : shown?.name}>
        {cloudOnly ? 'Chats' : (shown?.name ?? 'Cloud')}{#if shown?.machine && !cloudOnly}<small
            >{shown.machine}</small
          >{/if}
      </h2>
      <ListMenu {view} change={saveView} addSection={() => (naming = true)} />
      <!-- eslint-disable svelte/no-navigation-without-resolve -- built with resolve() -->
      <a
        class="new-session"
        href={!shown || shown.id === CLOUD
          ? resolve('/new')
          : `${resolve('/new')}?project=${encodeURIComponent(shown.id)}`}
        onclick={close}
        aria-label={!shown || cloudOnly ? 'New chat' : `New chat in ${shown.name}`}
        title={!shown || cloudOnly ? 'New chat' : `New chat in ${shown.name}`}><Plus size={16} /></a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    </div>
    {#if (shown?.chats.length ?? 0) > 8}<div class="sidebar-search">
        <Search size={14} /><input
          aria-label="Search chats"
          placeholder={`Search chats in ${shown?.name ?? 'Cloud'}`}
          bind:value={search}
        />
      </div>{/if}
    <nav class="session-list" class:dragging aria-label="Chats">
      {#if moveError}<p class="chat-error" role="alert">{moveError}</p>{/if}
      {#if !workspace.ready}<p class="place-empty" role="status" aria-label="Loading chats">
          <LoaderCircle size={16} class="place-spin" />
        </p>
      {:else}
        <ChatBlocks
          {blocks}
          row={chatRow}
          {sideOf}
          {naming}
          name={nameSection}
          rename={renameSection}
          remove={removeSection}
          toSection={(chat, section) => saveView(moveToSection(view, chat, section))}
        />
        {#if empty && !naming}<p class="place-empty">
            {words ? 'No chats match.' : 'No chats here yet.'}
          </p>{/if}
      {/if}
    </nav>
    <footer class="sidebar-footer">
      <UpdateBar />
      {#key open}<AccountMenu {close} />{/key}
    </footer>
  </div>
</aside>
