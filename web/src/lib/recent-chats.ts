import type { ContextId, Session } from '@crewstead/core/protocol';
import { getLatest } from './api';

/** A chat as the page last had it: shown at once on going back, then caught up from `cursor`. */
export type KeptChat = {
  session: Session;
  earlier: number;
  cursor: number;
  extras?: Record<string, unknown>;
};

/** Messages a chat opens with; earlier ones load as the reader scrolls up. */
export const LATEST = 200;
/** Chats kept; the oldest goes first. */
const KEEP = 12;
const kept = new Map<string, KeptChat>();
const fetching = new Set<string>();
const key = (id: string, context: ContextId) => `${context}\n${id}`;

export function keepChat(context: ContextId, chat: KeptChat) {
  const at = key(chat.session.id, context);
  kept.delete(at);
  kept.set(at, chat);
  for (const old of kept.keys()) {
    if (kept.size <= KEEP) break;
    kept.delete(old);
  }
}

export const keptChat = (id: string, context: ContextId) => kept.get(key(id, context));

/**
 * Loads a chat about to be opened (a pointer resting on its row or its project), so opening it
 * shows it at once. A chat already kept is caught up when it opens, so it is not loaded again.
 */
export function prefetchChat(id: string | undefined, context: ContextId) {
  if (!id) return;
  const at = key(id, context);
  if (kept.has(at) || fetching.has(at)) return;
  fetching.add(at);
  void getLatest(id, context, LATEST)
    .then((snapshot) => {
      if (!kept.has(at)) keepChat(context, snapshot);
    })
    .catch(() => {})
    .finally(() => fetching.delete(at));
}

export const forgetChat = (id: string, context: ContextId) => kept.delete(key(id, context));
