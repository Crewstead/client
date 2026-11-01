<script lang="ts">
  import ResizeHandle from './ResizeHandle.svelte';
  import { sidebarWidth } from '#lib/panel-widths.svelte.ts';
  import { resolve } from '$app/paths';
  import { Cloud, Laptop, MonitorPlay, Plus, Search } from '@lucide/svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { page } from '$app/state';
  import { busy, useWorkspace } from '#lib/workspace.svelte.ts';
  import { notifier } from '#lib/notifications.svelte.ts';
  import ChatRow from './ChatRow.svelte';
  import PlaceGroup from './PlaceGroup.svelte';
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
  const active = $derived(
    workspace.sessions
      .filter((session) => !session.archived)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
  );
  const sessions = $derived(
    active.filter((session) => session.title.toLowerCase().includes(search.toLowerCase())),
  );
  type Place = { id: string; name: string; computer: boolean; sessions: typeof sessions };
  // Chats on a computer are grouped under it, and there by place: the whole computer first, then
  // each project. While a chat is dragged, places with no chats yet show too, as places to drop it.
  let dragging = $state<{ id: string; from: string }>();
  let over = $state('');
  let moveError = $state('');
  const computers = $derived.by(() => {
    const list: { name: string; places: Place[] }[] = [];
    const placeFor = (id: string, saved?: string) => {
      const known = workspace.catalog?.projects.find((project) => project.id === id);
      const name = known?.machine ?? 'Offline computer';
      let computer = list.find((entry) => entry.name === name);
      if (!computer) list.push((computer = { name, places: [] }));
      let place = computer.places.find((entry) => entry.id === id);
      if (!place) {
        const whole = known?.kind === 'computer' || id.endsWith(':computer');
        place = {
          id,
          name: whole ? 'Whole computer' : (known?.name ?? saved ?? 'Project'),
          computer: whole,
          sessions: [],
        };
        computer.places.push(place);
      }
      return place;
    };
    for (const session of sessions)
      if (session.projectId)
        placeFor(session.projectId, session.projectName).sessions.push(session);
    for (const computer of list)
      computer.places.sort((a, b) => Number(b.computer) - Number(a.computer));
    // Added below the places already shown, so starting a drag does not move them under the pointer.
    if (dragging) for (const project of workspace.catalog?.projects ?? []) placeFor(project.id);
    return list;
  });
  const loose = $derived(sessions.filter((session) => !session.projectId));
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
  // Folded places, remembered in this browser.
  const FOLDED = 'crewstead:folded-places';
  const folded = new SvelteSet<string>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(FOLDED) ?? '[]') as string[];
      } catch {
        return [];
      }
    })(),
  );
  function fold(id: string) {
    if (folded.has(id)) folded.delete(id);
    else folded.add(id);
    try {
      localStorage.setItem(FOLDED, JSON.stringify([...folded]));
    } catch {
      // Not remembered in a private window; folding still works.
    }
  }
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
          await workspace.move(chat, target === 'cloud' ? null : target);
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
    dragging = started ? { id: session.id, from: session.projectId ?? 'cloud' } : undefined;
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
  <div class="sessions-heading">
    <h2>Chats</h2>
    <a
      class="new-session"
      href={resolve('/new')}
      onclick={close}
      aria-label="New chat"
      title="New chat"><Plus size={16} /></a
    >
  </div>
  {#if active.length > 8}<div class="sidebar-search">
      <Search size={14} /><input
        aria-label="Search chats"
        placeholder="Search chats"
        bind:value={search}
      />
    </div>{/if}
  <nav class="session-list" class:dragging aria-label="Chats">
    {#if moveError}<p class="chat-error" role="alert">{moveError}</p>{/if}
    {#each computers as computer (computer.name)}
      <section class="computer-chats" aria-label={`Computer ${computer.name}`}>
        <h3 class="computer-name"><Laptop size={12} />{computer.name}</h3>
        {#each computer.places as place (place.id)}
          <PlaceGroup
            label={place.computer ? `Whole computer ${computer.name}` : `Project ${place.name}`}
            name={place.name}
            kind={place.computer ? 'computer' : 'project'}
            chats={place.sessions}
            open={!folded.has(place.id)}
            toggle={() => fold(place.id)}
            over={over === place.id}
            drop={dropZone(place.id)}
            selected={page.params.id}
            {close}
            drag={dragOf}
          />
        {/each}
      </section>
    {/each}
    <!-- The cloud is a "where" like a computer; it has no projects, so its chats sit right under it. -->
    <section
      class="computer-chats cloud-chats"
      class:drop-over={over === 'cloud'}
      aria-label="Cloud chats"
      {@attach dropZone('cloud')}
    >
      {#if computers.length || dragging}<h3 class="computer-name"><Cloud size={12} />Cloud</h3>{/if}
      {#each loose as session (session.id)}
        <ChatRow
          {session}
          selected={page.params.id === session.id}
          {close}
          drag={dragOf(session)}
        />
      {/each}
    </section>
  </nav>
  <footer class="sidebar-footer">
    {#key open}<AccountMenu {close} />{/key}
  </footer>
</aside>
