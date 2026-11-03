<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import { ChevronRight, Cloud, Folder, GripVertical, Monitor } from '@lucide/svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import type { Place } from './sidebar-places.ts';
  import '@crewstead/ui/chat-row.css';
  import '@crewstead/ui/sidebar-places.css';
  let {
    place,
    open,
    over,
    drop,
    reorder,
    arranging = false,
  }: {
    place: Place;
    open: () => void;
    /** A dragged chat is over this place. */
    over: boolean;
    drop: Attachment<HTMLElement>;
    /** Rearranging the list: a drag or arrow keys on the row's icon. Absent where order is fixed. */
    reorder?: {
      grab: (event: PointerEvent) => void;
      key: (event: KeyboardEvent) => void;
      moving: boolean;
    };
    /** Edit order is on: the grip shows, and the row does not open. */
    arranging?: boolean;
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

<!--
  A place in the list: opens its chats in the panel, and takes a chat dropped on it. Its icon is also
  the handle that moves it in the list (it turns into a grip on hover).
-->
<div
  class="place-item"
  class:moving={reorder?.moving}
  class:arranging={arranging && !!reorder}
  data-place={place.id}
>
  {#if reorder}<span
      class="place-handle"
      role="button"
      tabindex="0"
      aria-label={`Move ${place.name}`}
      title="Drag to reorder, or use the arrow keys"
      onpointerdown={reorder.grab}
      onkeydown={reorder.key}><GripVertical size={14} /></span
    >{/if}
  <button
    class="place-row"
    class:drop-over={over}
    aria-label={`${place.name}${place.machine ? ` on ${place.machine}` : ''}, ${place.chats.length} ${place.chats.length === 1 ? 'chat' : 'chats'}`}
    onclick={open}
    {@attach drop}
  >
    <span class="place-icon" aria-hidden="true"
      >{#if place.kind === 'cloud'}<Cloud size={15} />{:else if place.kind === 'computer'}<Monitor
          size={15}
        />{:else}<Folder size={15} />{/if}</span
    >
    <span class="place-name">{place.name}</span>
    {#if place.machine}<span class="place-machine">{place.machine}</span>{/if}
    {#if state}<i class="chat-state {state.kind}" title={state.text}
        ><span class="sr-only">{state.text}</span></i
      >{/if}
    <span class="place-count">{place.chats.length || ''}</span>
    <ChevronRight size={13} class="place-chevron" />
  </button>
</div>
