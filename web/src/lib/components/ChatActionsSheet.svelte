<script lang="ts">
  import { Archive, FolderInput, Pin, PinOff } from '@lucide/svelte';
  import '@crewstead/ui/action-sheet.css';
  let {
    title,
    pinned,
    pin,
    move,
    archive,
    close,
  }: {
    title: string;
    pinned: boolean;
    pin: () => void;
    move: () => void;
    archive: () => void;
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
    <button onclick={choose(move)}><FolderInput size={18} />Move to…</button>
    <button onclick={choose(archive)}><Archive size={18} />Archive</button>
  </div>
  <button class="action-sheet-cancel" onclick={() => dialog.close()}>Cancel</button>
</dialog>
