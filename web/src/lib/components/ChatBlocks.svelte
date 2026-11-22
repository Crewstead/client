<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ChatSummary as Chat } from '#lib/api.ts';
  import RowMenu from './RowMenu.svelte';
  import type { ListBlock, ListSection } from './list-view.ts';
  import '@crewstead/ui/chat-blocks.css';
  let {
    blocks,
    row,
    sideOf,
    naming,
    name,
    rename,
    remove,
    toSection,
  }: {
    blocks: ListBlock[];
    /** One chat's row; `side` for a subagent's chat under its own, `last` for the last of those. */
    row: Snippet<[Chat, boolean, boolean]>;
    /** The side chats to show under a chat; none unless the list shows them. */
    sideOf: (id: string) => Chat[];
    /** A new section is being named. */
    naming: boolean;
    /** The new section's name, or null to give up. */
    name: (text: string | null) => void;
    rename: (section: ListSection, text: string) => void;
    remove: (section: ListSection) => void;
    /** A chat dropped on a section's heading goes into it; on "Chats", out of every section. */
    toSection: (chat: string, section?: string) => void;
  } = $props();
  type Entry =
    | { kind: 'heading'; key: string; block: ListBlock }
    | { kind: 'chat'; key: string; chat: Chat; side: boolean; last: boolean };
  const entries = $derived(
    blocks.flatMap((block): Entry[] => [
      ...(block.label ? [{ kind: 'heading' as const, key: `heading:${block.key}`, block }] : []),
      ...block.chats.flatMap((chat) => [
        { kind: 'chat' as const, key: chat.id, chat, side: false, last: false },
        ...sideOf(chat.id).map((side, at, all) => ({
          kind: 'chat' as const,
          key: side.id,
          chat: side,
          side: true,
          last: at === all.length - 1,
        })),
      ]),
    ]),
  );
  let renaming = $state('');
  let over = $state('');
  const CHAT = 'application/x-crewstead-chat';
  function dropTarget(key: string, section?: string) {
    return {
      ondragover: (event: DragEvent) => {
        if (!event.dataTransfer?.types.includes(CHAT)) return;
        event.preventDefault();
        over = key;
      },
      ondragleave: () => {
        if (over === key) over = '';
      },
      ondrop: (event: DragEvent) => {
        const chat = event.dataTransfer?.getData(CHAT);
        over = '';
        if (!chat) return;
        event.preventDefault();
        toSection(chat, section);
      },
    };
  }
  /** Enter saves the name, Escape (or an empty name) gives up. */
  function field(save: (text: string | null) => void) {
    return (node: HTMLInputElement) => {
      node.focus();
      const key = (event: KeyboardEvent) => {
        if (event.key === 'Escape') save(null);
        if (event.key === 'Enter') save(node.value.trim() || null);
      };
      const blur = () => save(node.value.trim() || null);
      node.addEventListener('keydown', key);
      node.addEventListener('blur', blur);
      return () => {
        node.removeEventListener('keydown', key);
        node.removeEventListener('blur', blur);
      };
    };
  }
</script>

{#if naming}<input
    class="block-name"
    aria-label="New section name"
    placeholder="Section name"
    maxlength="80"
    {@attach field((text) => name(text))}
  />{/if}
<!-- One flat list, so a chat moving between runs (pinning it) keeps its row, and with it focus. -->
{#each entries as entry (entry.key)}
  {#if entry.kind === 'heading'}
    {@const block = entry.block}
    {@const section = block.section}
    {#if section && renaming === section.id}<input
        class="block-name"
        aria-label="Section name"
        value={section.name}
        maxlength="80"
        {@attach field((text) => {
          renaming = '';
          if (text && text !== section.name) rename(section, text);
        })}
      />{:else}
      <h3
        class="block-heading"
        class:drop-over={over === block.key}
        {...section || block.key === 'rest' ? dropTarget(block.key, section?.id) : {}}
      >
        <span>{block.label}</span>
        {#if section}<RowMenu
            label={`Section ${section.name}`}
            items={[
              { label: 'Rename', run: () => (renaming = section.id) },
              { label: 'Delete', confirm: 'Delete? Its chats stay.', run: () => remove(section) },
            ]}
          />{/if}
      </h3>
    {/if}
  {:else}{@render row(entry.chat, entry.side, entry.last)}{/if}
{/each}
