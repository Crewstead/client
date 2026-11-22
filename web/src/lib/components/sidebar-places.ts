import type { Project } from '@crewstead/core/protocol';
import type { ChatSummary as Chat } from '#lib/api.ts';

/** The id the cloud goes by in the left panel; chats there have no project. */
export const CLOUD = 'cloud';

/** One "where" in the left panel: the cloud, a computer as a whole, or a project folder. */
export interface Place {
  id: string;
  name: string;
  kind: 'cloud' | 'computer' | 'project';
  /** The computer it is on; none for the cloud. */
  machine?: string;
  /** Its computer is not connected now (only past chats name it). */
  offline?: boolean;
  chats: Chat[];
  /** When one of its chats last changed, to list the busiest places first. */
  latest: string;
}

/**
 * Every place: each project and whole computer the hub knows (with or without chats), places only past
 * chats name (a computer that is offline or removed), and the cloud. In the owner's own order once
 * they arranged it (places added since go after, busiest first); until then busiest first, the cloud
 * last. Chats are in `chatOrder`.
 */
export function placesOf(
  chats: Chat[],
  projects: Project[],
  order: string[] = [],
  pinnedOrder: string[] = [],
): Place[] {
  const places = new Map<string, Place>();
  const add = (id: string, saved?: string) => {
    let place = places.get(id);
    if (!place) {
      const known = projects.find((project) => project.id === id);
      const whole = known?.kind === 'computer' || id.endsWith(':computer');
      place = {
        id,
        name: whole ? 'Whole computer' : (known?.name ?? saved ?? 'Project'),
        kind: whole ? 'computer' : 'project',
        machine: known?.machine ?? 'Offline computer',
        ...(known ? {} : { offline: true }),
        chats: [],
        latest: '',
      };
      places.set(id, place);
    }
    return place;
  };
  for (const project of projects) add(project.id);
  const cloud: Place = { id: CLOUD, name: 'Cloud', kind: 'cloud', chats: [], latest: '' };
  for (const chat of chats) {
    const place = chat.projectId ? add(chat.projectId, chat.projectName) : cloud;
    place.chats.push(chat);
    if (chat.updatedAt > place.latest) place.latest = chat.updatedAt;
  }
  for (const place of [...places.values(), cloud])
    place.chats = chatOrder(place.chats, pinnedOrder);
  const listed = [...places.values()].sort(
    (a, b) => b.latest.localeCompare(a.latest) || a.name.localeCompare(b.name),
  );
  const all = [...listed, cloud];
  if (!order.length) return all;
  const rank = (place: Place) => {
    const at = order.indexOf(place.id);
    return at < 0 ? order.length : at;
  };
  // A stable sort: places not in the saved order keep their busiest-first order after the rest.
  return all.sort((a, b) => rank(a) - rank(b));
}

/** Places on one computer (or the cloud), as the left panel lists them. */
export interface PlaceGroup {
  /** The computer's name; none for the cloud. */
  machine?: string;
  places: Place[];
}

/**
 * Places under the computer they are on: the cloud first, then connected computers in the order their
 * first place comes, then offline ones.
 */
export function groupsOf(places: Place[]): PlaceGroup[] {
  const groups: PlaceGroup[] = [];
  for (const place of places) {
    const group = groups.find((entry) => entry.machine === place.machine);
    if (group) group.places.push(place);
    else groups.push({ ...(place.machine ? { machine: place.machine } : {}), places: [place] });
  }
  const rank = (group: PlaceGroup) =>
    !group.machine ? 0 : group.places.every((place) => place.offline) ? 2 : 1;
  return groups.sort((a, b) => rank(a) - rank(b));
}

/** `ids` in order, with those in `part` rearranged among their own positions as `part` lists them. */
export function rearranged(ids: string[], part: string[]) {
  const moved = new Set(part);
  let next = 0;
  return ids.map((id) => (moved.has(id) ? part[next++]! : id));
}

const written = (chat: Chat) => chat.lastMessageAt ?? chat.createdAt;

/**
 * Pinned chats first, in the order the owner arranged (ones pinned since go after them), then the
 * rest by their last message, newest first.
 */
export function chatOrder(chats: Chat[], pinnedOrder: string[] = []): Chat[] {
  const rank = (chat: Chat) => {
    const at = pinnedOrder.indexOf(chat.id);
    return at < 0 ? pinnedOrder.length : at;
  };
  return [...chats].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (a.pinned ? rank(a) - rank(b) : 0) ||
      written(b).localeCompare(written(a)),
  );
}

/** A project's tile in the projects bar: up to two letters of its name ("agent-hub" → "AH"). */
export function initials(name: string) {
  const words = name
    .split(/[^\p{L}\p{N}]+|(?<=\p{Ll})(?=\p{Lu})/u)
    .filter(Boolean)
    .map((word) => [...word]);
  const letters = words.length > 1 ? [words[0]![0], words[1]![0]] : (words[0] ?? ['?']).slice(0, 2);
  return letters.join('').toUpperCase();
}

/** One of the six chart colours, the same for a name every time. */
export function hueOf(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return (hash % 6) + 1;
}

/** The most pressing state among a place's chats, as the chat rows show it. */
export function placeState(place: Place, unseen: ReadonlyMap<string, 'done' | 'failed'>) {
  if (place.chats.some((chat) => chat.status === 'awaiting_approval'))
    return { kind: 'waiting', text: 'A chat waits for you' };
  if (place.chats.some((chat) => chat.status === 'running'))
    return { kind: 'working', text: 'A chat is working' };
  const endings = place.chats.map((chat) => unseen.get(chat.id));
  if (endings.includes('failed')) return { kind: 'failed', text: 'A reply failed' };
  if (endings.includes('done')) return { kind: 'done', text: 'New replies' };
  return undefined;
}

const LAST_CHATS = 'crewstead:last-chats';
/** The chat last open in each place of a workspace, on this device; nothing when storage is off. */
function lastChats(context: string): Record<string, string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(`${LAST_CHATS}:${context}`) ?? '{}');
    return saved && typeof saved === 'object' ? (saved as Record<string, string>) : {};
  } catch {
    return {};
  }
}
export const lastChat = (context: string, place: string) => lastChats(context)[place];
export function rememberChat(context: string, place: string, chat: string) {
  try {
    const saved = lastChats(context);
    if (saved[place] === chat) return;
    localStorage.setItem(`${LAST_CHATS}:${context}`, JSON.stringify({ ...saved, [place]: chat }));
  } catch {
    // Without storage, choosing a place opens its first chat.
  }
}
