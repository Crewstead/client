<script lang="ts">
  import {
    Archive,
    ChevronDown,
    ChevronRight,
    FolderInput,
    ListPlus,
    ListX,
    Pin,
    PinOff,
  } from '@lucide/svelte';
  import '@crewstead/ui/action-sheet.css';
  let {
    title,
    pinned,
    pin,
    move,
    archive,
    sections = [],
    fold,
    close,
  }: {
    title: string;
    pinned: boolean;
    pin: () => void;
    move: () => void;
    archive: () => void;
    /** The list's sections: the chat goes into one, or out of the one it is in. */
    sections?: { name: string; has: boolean; run: () => void }[];
    /** Its side chats, shown under it or folded away. */
    fold?: { count: number; open: boolean; toggle: () => void } | undefined;
    close: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  /** Does what was chosen once the sheet is closed. */
  const choose = (action: () => void) => () => {
    dialog.close();
    action();
  };
</script>

<!-- A chat's actions on touch screens: a sheet from the bottom of the screen, the list unmoved. -->
<dialog
  class="action-sheet"
  aria-label={`Actions for ${title}`}
  bind:this={dialog}
  {@attach (node) => node.showModal()}
  onclose={close}
  onclick={(event) => {
    if (event.target === event.currentTarget) dialog.close();
  }}
>
  <p class="action-sheet-title">{title}</p>
  <div class="action-sheet-actions">
    <button onclick={choose(pin)}
      >{#if pinned}<PinOff size={18} />Unpin{:else}<Pin size={18} />Pin{/if}</button
    >
    <button onclick={choose(move)}><FolderInput size={18} />Move</button>
    <button onclick={choose(archive)}><Archive size={18} />Archive</button>
    {#if fold}<button onclick={choose(fold.toggle)}
        >{#if fold.open}<ChevronDown size={18} />Hide side chats{:else}<ChevronRight
            size={18}
          />Show side chats{/if}</button
      >{/if}
    {#each sections as section (section.name)}<button onclick={choose(section.run)}
        >{#if section.has}<ListX size={18} />Out of “{section.name}”{:else}<ListPlus
            size={18}
          />Into “{section.name}”{/if}</button
      >{/each}
  </div>
  <button class="action-sheet-cancel" onclick={() => dialog.close()}>Cancel</button>
</dialog>
