<script lang="ts">
  import { ChevronLeft, ChevronRight, Cloud, Laptop, X } from '@lucide/svelte';
  import { browserOfKey } from '@crewstead/core/protocol';
  import { liveId, type Watchable } from '#lib/live-browsers.svelte.ts';
  import '@crewstead/ui/live-browser.css';
  let {
    sessions,
    selected,
    select,
    close,
    names,
    compact = false,
  }: {
    /** Open tabs, a browser's tabs next to each other. */
    sessions: Watchable[];
    /** The selected tab's id (`liveId`). */
    selected: string;
    select: (id: string) => void;
    close?: (session: Watchable) => void;
    /** Each tab's title (the page's) and, below it, which chat it belongs to. */
    names: (session: Watchable) => { title: string; chat?: string; url: string };
    /** Smaller tabs, for the chat's side panel. */
    compact?: boolean;
  } = $props();
  /**
   * Each browser's tabs together, like a browser's tab groups. When a chat has several browsers, or
   * tabs of several chats show, each group's tabs are underlined in its own colour.
   */
  const groups = $derived.by(() => {
    const chats = sessions
      .map((page) => page.chatId)
      .filter((chat, index, all) => all.indexOf(chat) === index).length;
    const several = (page: Watchable) =>
      chats > 1 || sessions.some((other) => other.chatId === page.chatId && other.key !== page.key);
    const list: { key: string; number: number; marked: boolean; tabs: Watchable[] }[] = [];
    for (const page of sessions) {
      const last = list.at(-1);
      if (last?.key === page.key) last.tabs.push(page);
      else {
        const number = Number(browserOfKey(page.key).slice(1));
        list.push({
          key: page.key,
          number,
          marked: several(page),
          tabs: [page],
        });
      }
    }
    return list;
  });
  let row = $state<HTMLDivElement>();
  // Whether tabs are hidden past either end, for the arrows.
  let hiddenLeft = $state(false);
  let hiddenRight = $state(false);
  function measure() {
    if (!row) return;
    hiddenLeft = row.scrollLeft > 1;
    hiddenRight = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
  }
  $effect(() => {
    void sessions.length;
    requestAnimationFrame(measure);
  });
  /** Scrolls by most of the visible width, towards `direction` (-1 left, 1 right). */
  const page = (direction: number) =>
    row?.scrollBy({ left: direction * row.clientWidth * 0.7, behavior: 'smooth' });
  /** An up-and-down mouse wheel scrolls the tabs sideways while the pointer is over them. */
  function wheel(event: WheelEvent) {
    if (!row || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (row.scrollWidth <= row.clientWidth) return;
    event.preventDefault();
    row.scrollLeft += event.deltaY;
  }
  // Brings the selected tab into sight, sideways only, when the selection changes, clear of the arrows.
  $effect(() => {
    const id = selected;
    const frame = requestAnimationFrame(() => {
      const tab = row?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
      if (!row || !tab) return;
      const box = tab.getBoundingClientRect();
      const view = row.getBoundingClientRect();
      if (box.right > view.right - 28) row.scrollLeft += box.right - view.right + 28;
      else if (box.left < view.left + 28) row.scrollLeft -= view.left + 28 - box.left;
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<!-- One tab per open page: its title and whether its browser runs on a computer or the server. -->
<div class="live-tab-row" class:hidden-left={hiddenLeft} class:hidden-right={hiddenRight}>
  {#if hiddenLeft}<button
      class="live-tab-scroll left"
      aria-label="Show earlier tabs"
      onclick={() => page(-1)}><ChevronLeft size={14} /></button
    >{/if}
  <div
    class="live-tabs"
    class:compact
    role="tablist"
    aria-label="Browser sessions"
    bind:this={row}
    onscroll={measure}
    {@attach (node) => {
      // The wheel must be able to stop the page scrolling, so its listener cannot be passive.
      node.addEventListener('wheel', wheel, { passive: false });
      const resized = new ResizeObserver(measure);
      resized.observe(node);
      return () => {
        node.removeEventListener('wheel', wheel);
        resized.disconnect();
      };
    }}
  >
    {#each groups as group (group.key)}
      <div class="live-tab-browser" class:marked={group.marked} data-group={(group.number - 1) % 5}>
        {#each group.tabs as session (liveId(session))}
          {@const current = liveId(session) === selected}
          {@const name = names(session)}
          {@const place =
            session.where === 'server'
              ? 'On the server'
              : `On ${session.machine ?? 'your computer'}`}
          <div
            class="live-tab"
            class:active={current}
            data-where={session.where}
            data-id={liveId(session)}
          >
            <button
              role="tab"
              aria-selected={current}
              title={[
                name.title,
                [name.chat, group.marked && `Browser ${group.number}`, place]
                  .filter(Boolean)
                  .join(' · '),
                name.url,
              ].join('\n')}
              onclick={() => select(liveId(session))}
            >
              <span class="live-tab-icon" aria-label={place}
                >{#if session.where === 'server'}<Cloud size={compact ? 12 : 14} />{:else}<Laptop
                    size={compact ? 12 : 14}
                  />{/if}</span
              >
              <span class="live-tab-text"><span>{name.title}</span></span>
            </button>
            {#if close}<button
                class="live-tab-close"
                aria-label={`Close the tab ${name.title}`}
                title="Close this tab"
                onclick={() => close(session)}><X size={12} /></button
              >{/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  {#if hiddenRight}<button
      class="live-tab-scroll right"
      aria-label="Show more tabs"
      onclick={() => page(1)}><ChevronRight size={14} /></button
    >{/if}
</div>
