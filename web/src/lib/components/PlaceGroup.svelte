<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import { ChevronRight, Cloud, Folder, Monitor } from '@lucide/svelte';
  import type { Session } from '@crewstead/core/protocol';
  import ChatRow from './ChatRow.svelte';
  type Chat = Omit<Session, 'items'>;
  let {
    label,
    name,
    kind,
    chats,
    open,
    toggle,
    over,
    drop,
    selected,
    close,
    drag,
  }: {
    /** The group's accessible name, e.g. "Project Shop". */
    label: string;
    name: string;
    kind: 'project' | 'computer' | 'cloud';
    chats: Chat[];
    open: boolean;
    toggle: () => void;
    /** A dragged chat is over this place. */
    over: boolean;
    drop: Attachment<HTMLElement>;
    selected: string | undefined;
    close: () => void;
    drag: (chat: Chat) => (started: boolean) => void;
  } = $props();
</script>

<!-- One place in the chat tree: a row that folds, and its chats indented under it. -->
<section
  class="place-group"
  class:drop-over={over}
  class:empty={!chats.length}
  aria-label={label}
  {@attach drop}
>
  <button class="place-head" aria-expanded={open} onclick={toggle}>
    <ChevronRight size={12} class="place-chevron" />
    {#if kind === 'cloud'}<Cloud size={14} />{:else if kind === 'computer'}<Monitor
        size={14}
      />{:else}<Folder size={14} />{/if}
    <span class="place-name">{name}</span>
    {#if !open && chats.length}<span class="place-count">{chats.length}</span>{/if}
  </button>
  {#if open && chats.length}
    <div class="place-chats">
      {#each chats as chat (chat.id)}
        <ChatRow session={chat} selected={selected === chat.id} {close} drag={drag(chat)} />
      {/each}
    </div>
  {/if}
</section>
