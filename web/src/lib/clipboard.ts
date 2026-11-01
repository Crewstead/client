/** Copies text. The Clipboard API needs HTTPS or localhost; plain-HTTP pages fall back to a selection copy. */
export async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  // Inside an open dialog, only the dialog's own content can be selected.
  (document.querySelector('dialog[open]') ?? document.body).append(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('Copy is not available here');
}
