/** What the owner can do with a chat's prompts and answers, from the timeline. */
export interface ChatActions {
  /** Nothing can be sent now: a reply is running, or the chat is not connected. */
  disabled: boolean;
  /** Sends a prompt (or the one an answer replied to) again as a new version, with new text to edit it. */
  again(itemId: string, text?: string): Promise<boolean>;
  /** Shows another version of the chat from a prompt on. */
  version(anchor: string, version: number): Promise<void>;
  /** Opens a new chat with the messages up to the end of this turn. */
  fork(itemId: string): Promise<void>;
}

/** Where a prompt's versions are kept, which is shown, and how many there are. */
export interface Versions {
  anchor: string;
  active: number;
  count: number;
}

/** Copies text; also on plain-HTTP addresses, where the clipboard API is missing. */
export async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}
