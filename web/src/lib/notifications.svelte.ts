import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { isQuietReply, type ContextId, type Session } from '@crewstead/core/protocol';
import { getSession } from './api.ts';

const KEY = 'crewstead:notifications';
const read = () => {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
};

type Chat = Omit<Session, 'items'>;
const working = (status: Session['status']) =>
  status === 'running' || status === 'awaiting_approval';

/**
 * The chat's last reply when it was written after `since` (the chat's last change before its work
 * started), else undefined: nothing new, e.g. a scheduled run that had nothing to say was removed.
 */
export async function newReply(chatId: string, context: ContextId, since: number) {
  const session = await getSession(chatId, context).catch(() => undefined);
  const reply = session?.session.items.findLast((item) => item.role === 'assistant');
  if (!reply || isQuietReply(reply.text) || Date.parse(reply.createdAt) <= since) return undefined;
  return reply.text;
}

/**
 * System notifications, in this browser, when a chat finishes, fails or waits for approval while the
 * owner looks elsewhere (another chat, another window). Off until turned on in Settings → Chats.
 */
class ChatNotifier {
  wanted = $state(typeof window === 'undefined' ? false : read());
  permission = $state<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  /** Each working chat's last change before it started, so its ending reply is known to be new. */
  private since = new Map<string, number>();

  get on() {
    return this.wanted && this.permission === 'granted';
  }

  async turnOn() {
    if (this.permission === 'unsupported') return;
    this.permission = await Notification.requestPermission();
    this.save(this.permission === 'granted');
  }
  turnOff() {
    this.save(false);
  }
  private save(on: boolean) {
    this.wanted = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      /* kept for this page only */
    }
  }

  /**
   * A chat changed from `previous` (its entry before) to `chat`; `open` is the chat shown here. Returns,
   * when its work just ended, when that work started (its last change before), else 0.
   */
  changed(chat: Chat, previous: Chat, context: ContextId, open: string) {
    const before = previous.status;
    // Its last change before it started working: a reply written after that is this run's.
    if (working(chat.status) && !working(before))
      this.since.set(chat.id, Date.parse(previous.updatedAt));
    let since = 0;
    if (working(before) && !working(chat.status)) {
      since = this.since.get(chat.id) ?? 0;
      this.since.delete(chat.id);
    }
    if (!this.on || chat.status === before || chat.parent) return since;
    // The chat in front of the owner needs no notification.
    if (chat.id === open && document.hasFocus()) return since;
    if (chat.status === 'awaiting_approval') this.show(chat, 'Waiting for your approval.');
    else if (chat.status === 'failed' && working(before))
      this.show(chat, 'The reply stopped with an error.');
    else if (chat.status === 'idle' && working(before)) void this.finished(chat, context, since);
    return since;
  }

  /** A finished reply, with its first words; none for a scheduled run that had nothing new. */
  private async finished(chat: Chat, context: ContextId, since: number) {
    const text = await newReply(chat.id, context, since);
    if (text === undefined) return;
    const plain = text
      .replace(/[#*_`>[\]|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    this.show(chat, plain.length > 140 ? `${plain.slice(0, 139)}…` : plain || 'Finished.');
  }

  private show(chat: Chat, body: string) {
    const shown = new Notification(chat.title || 'Chat', { body, tag: chat.id });
    shown.onclick = () => {
      window.focus();
      void goto(resolve('/sessions/[id]', { id: chat.id }));
      shown.close();
    };
  }
}

export const notifier = new ChatNotifier();
