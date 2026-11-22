import { SvelteSet } from 'svelte/reactivity';

const KEY = 'crewstead:folded-side-chats';

function read(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Chats whose side chats are folded away in the list, on this device. */
export class SideFolds {
  folded = new SvelteSet<string>(read());

  toggle(id: string) {
    if (this.folded.has(id)) this.folded.delete(id);
    else this.folded.add(id);
    try {
      // Only the latest few hundred are kept; chats gone long ago need no entry.
      localStorage.setItem(KEY, JSON.stringify([...this.folded].slice(-300)));
    } catch {
      // Without storage the fold lasts until the page reloads.
    }
  }
}
