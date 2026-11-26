import type { ItemDelta, TimelineItem } from '@crewstead/core/protocol';

/** How often streamed text shows: often enough to read as it comes, far less often than it arrives. */
const SHOW_EVERY_MS = 50;

type Waiting = { itemId: string; field: 'text' | 'reasoning'; base: number; text: string };

const lengthOf = (item: TimelineItem, field: Waiting['field']) =>
  field === 'reasoning' ? (item.reasoning ?? '').length : item.text.length;

/**
 * A reply's text fragments, gathered and added to the chat together a few times a second. Every
 * change to a message redraws the chat around it, so one per fragment (dozens a second) kept the
 * page busy. A fragment after a gap is skipped: the next saved update carries the full text.
 */
export class StreamedText {
  private waiting = new Map<string, Waiting>();
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private items: () => TimelineItem[] | undefined) {}

  add(delta: ItemDelta) {
    const field = delta.field ?? 'text';
    const key = `${delta.itemId}:${field}`;
    const waiting = this.waiting.get(key);
    if (waiting) {
      if (waiting.base + waiting.text.length === delta.offset) waiting.text += delta.text;
    } else {
      const item = this.find(delta.itemId);
      if (!item || lengthOf(item, field) !== delta.offset) return;
      this.waiting.set(key, { itemId: delta.itemId, field, base: delta.offset, text: delta.text });
    }
    this.timer ??= setTimeout(() => this.show(), SHOW_EVERY_MS);
  }

  /** Adds what is waiting now; before anything else changes the chat, so it applies in order. */
  show() {
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const { itemId, field, base, text } of this.waiting.values()) {
      const item = this.find(itemId);
      // Replaced meanwhile by a saved update, which has this text already.
      if (!item || lengthOf(item, field) !== base) continue;
      if (field === 'reasoning') item.reasoning = (item.reasoning ?? '') + text;
      else item.text += text;
    }
    this.waiting.clear();
  }

  /** Drops what is waiting, for a chat replaced as a whole. */
  drop() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.waiting.clear();
  }

  // The reply being written is nearly always the last message.
  private find(id: string) {
    return this.items()?.findLast((item) => item.id === id);
  }
}
