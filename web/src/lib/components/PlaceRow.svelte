<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import { ChevronRight, Cloud, Folder, Monitor } from '@lucide/svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import type { Place } from './sidebar-places.ts';
  import '@crewstead/ui/chat-row.css';
  import '@crewstead/ui/sidebar-places.css';
  let {
    place,
    open,
    over,
    drop,
  }: {
    place: Place;
    open: () => void;
    /** A dragged chat is over this place. */
    over: boolean;
    drop: Attachment<HTMLElement>;
  } = $props();
  const workspace = useWorkspace();
  /** The most pressing state among its chats, as the chat rows show it. */
  const state = $derived.by(() => {
    if (place.chats.some((chat) => chat.status === 'awaiting_approval'))
      return { kind: 'waiting', text: 'A chat waits for your approval' };
    if (place.chats.some((chat) => chat.status === 'running'))
      return { kind: 'working', text: 'A chat is working' };
    const endings = place.chats.map((chat) => workspace.unseen.get(chat.id));
    if (endings.includes('failed')) return { kind: 'failed', text: 'A reply failed' };
    if (endings.includes('done')) return { kind: 'done', text: 'New replies' };
    return undefined;
  });
</script>

<!-- A place in the list: opens its chats in the panel, and takes a chat dropped on it. -->
<button
  class="place-row"
  class:drop-over={over}
  aria-label={`${place.name}${place.machine ? ` on ${place.machine}` : ''}, ${place.chats.length} ${place.chats.length === 1 ? 'chat' : 'chats'}`}
  onclick={open}
  {@attach drop}
>
  {#if place.kind === 'cloud'}<Cloud size={15} />{:else if place.kind === 'computer'}<Monitor
      size={15}
    />{:else}<Folder size={15} />{/if}
  <span class="place-name">{place.name}</span>
  {#if place.machine}<span class="place-machine">{place.machine}</span>{/if}
  {#if state}<i class="chat-state {state.kind}" title={state.text}
      ><span class="sr-only">{state.text}</span></i
    >{/if}
  <span class="place-count">{place.chats.length || ''}</span>
  <ChevronRight size={13} class="place-chevron" />
</button>
