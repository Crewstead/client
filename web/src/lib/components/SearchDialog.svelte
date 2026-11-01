<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Archive, Bot, MessageSquare, Search, User } from '@lucide/svelte';
  import { searchWords, type SearchChat } from '@crewstead/core/protocol';
  import { request, scoped } from '#lib/api.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/search.css';
  let { close }: { close: () => void } = $props();
  const workspace = useWorkspace();
  let query = $state('');
  let results = $state<SearchChat[]>();
  let failed = $state('');
  let active = $state(0);
  let asked = 0;
  // Searches a moment after typing stops; an older answer arriving late is ignored.
  $effect(() => {
    const words = query.trim();
    const context = workspace.context;
    const turn = ++asked;
    if (!words) {
      results = undefined;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const found = await request<SearchChat[]>(
          `${scoped('/search', context)}&q=${encodeURIComponent(words)}`,
        );
        if (turn !== asked) return;
        results = found;
        failed = '';
        active = 0;
      } catch (cause) {
        if (turn === asked) failed = cause instanceof Error ? cause.message : 'Search failed.';
      }
    }, 200);
    return () => clearTimeout(timer);
  });
  // Every place a result can go, in the order shown, for the arrow keys.
  const targets = $derived(
    (results ?? []).flatMap((chat) => [
      { key: chat.id, href: resolve('/sessions/[id]', { id: chat.id }) },
      ...chat.hits.map((hit) => ({
        key: `${chat.id}:${hit.itemId}`,
        href: resolve(`/sessions/${chat.id}?item=${hit.itemId}` as '/'),
      })),
    ]),
  );
  const indexOf = (key: string) => targets.findIndex((target) => target.key === key);
  /** The snippet in parts, the searched words marked. */
  function parts(text: string) {
    const words = searchWords(query).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!words.length) return [{ text, mark: false }];
    return text
      .split(new RegExp(`(${words.join('|')})`, 'gi'))
      .filter(Boolean)
      .map((part) => ({
        text: part,
        mark: words.some((word) => new RegExp(`^${word}$`, 'i').test(part)),
      }));
  }
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  function open(href: string) {
    close();
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- built with resolve() above
    void goto(href);
  }
  function keys(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!targets.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + targets.length) % targets.length;
      document.querySelector('.search-results .active')?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && targets[active]) {
      event.preventDefault();
      open(targets[active].href);
    }
  }
</script>

{#snippet marked(text: string)}{#each parts(text) as part, index (index)}{#if part.mark}<mark
        >{part.text}</mark
      >{:else}{part.text}{/if}{/each}{/snippet}

<dialog
  class="dialog-content search-dialog"
  aria-label="Search chats"
  {@attach (node) => node.showModal()}
  onclose={close}
  onclick={(event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  }}
>
  <div class="search-field">
    <Search size={16} aria-hidden="true" />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      aria-label="Search all chats"
      placeholder="Search chat names and messages"
      autocomplete="off"
      autofocus
      bind:value={query}
      onkeydown={keys}
    />
    <kbd>Esc</kbd>
  </div>
  <div class="search-results" role="list">
    {#if failed}<p class="search-empty" role="alert">{failed}</p>
    {:else if !query.trim()}<p class="search-empty">
        Finds words in every chat of this workspace, in their names and messages.
      </p>
    {:else if results && !results.length}<p class="search-empty">
        Nothing found for “{query.trim()}”.
      </p>
    {:else if results}
      {#each results as chat (chat.id)}
        <section class="search-chat" role="listitem" aria-label={chat.title}>
          <a
            class="search-target search-chat-title"
            class:active={targets[active]?.key === chat.id}
            href={resolve('/sessions/[id]', { id: chat.id })}
            onclick={close}
            onmouseenter={() => (active = indexOf(chat.id))}
            ><MessageSquare size={14} /><span>{@render marked(chat.title)}</span
            >{#if chat.archived}<span class="search-tag"><Archive size={11} />Archived</span
              >{/if}<small>{when(chat.updatedAt)}</small></a
          >
          {#each chat.hits as hit (hit.itemId)}
            {@const key = `${chat.id}:${hit.itemId}`}
            <a
              class="search-target search-hit"
              class:active={targets[active]?.key === key}
              href={resolve(`/sessions/${chat.id}?item=${hit.itemId}` as '/')}
              onclick={close}
              onmouseenter={() => (active = indexOf(key))}
              >{#if hit.role === 'user'}<User size={13} aria-label="You" />{:else}<Bot
                  size={13}
                  aria-label="Reply"
                />{/if}<span>{@render marked(hit.snippet)}</span><small>{when(hit.createdAt)}</small
              ></a
            >
          {/each}
          {#if chat.more}<p class="search-more">
              {chat.more} more {chat.more === 1 ? 'message' : 'messages'} in this chat
            </p>{/if}
        </section>
      {/each}
    {/if}
  </div>
</dialog>
