import type { Attachment } from 'svelte/attachments';

/** The press landed on the backdrop: on the dialog element itself, but outside its box. */
const onBackdrop = (dialog: HTMLDialogElement, event: MouseEvent) => {
  if (event.target !== dialog) return false;
  const box = dialog.getBoundingClientRect();
  return (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  );
};

/**
 * Closes a modal dialog when the backdrop around it is clicked, as Escape does: a `cancel` event
 * first, which a dialog may take over (or refuse while busy), then `close`. Only a press that also
 * started outside counts, so selecting text and letting go past the edge keeps it open.
 */
export const closeOutside: Attachment<HTMLDialogElement> = (dialog) => {
  let started = false;
  const down = (event: PointerEvent) => {
    started = onBackdrop(dialog, event);
  };
  const click = (event: MouseEvent) => {
    if (!started || !onBackdrop(dialog, event)) return;
    started = false;
    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
  };
  dialog.addEventListener('pointerdown', down);
  dialog.addEventListener('click', click);
  return () => {
    dialog.removeEventListener('pointerdown', down);
    dialog.removeEventListener('click', click);
  };
};
