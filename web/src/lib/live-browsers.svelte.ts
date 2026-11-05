import type { LiveControl, LiveSession } from '@crewstead/core/protocol';
import { request } from './api.ts';

/**
 * One tab of a browser session from one of the sources modules offer, with the API path it came from.
 * `url` and `title` are that tab's; `tab` is missing for sources that do not report tabs.
 */
export type Watchable = Omit<LiveSession, 'tabs'> & {
  base: string;
  tab?: string;
  current: boolean;
};

/** A tab's id across sources and sessions. */
export const liveId = (page: Watchable) => `${page.base}|${page.key}|${page.tab ?? ''}`;

/** The query naming a tab, for the source's stream, controls and input. */
export const tabQuery = (page: Watchable) => (page.tab ? `?tab=${page.tab}` : '');

/** Every tab of every session, in order. */
function tabsOf(session: LiveSession, base: string): Watchable[] {
  const { tabs, ...rest } = session;
  if (!tabs?.length) return [{ ...rest, base, current: true }];
  return tabs.map((tab) => ({
    ...rest,
    base,
    url: tab.url,
    title: tab.title,
    tab: tab.id,
    current: tab.current,
  }));
}

/** The API paths of the live browser sources the running modules offer. */
export const liveSources = (modules: { liveBrowsers?: string }[]) =>
  modules.flatMap((module) => (module.liveBrowsers ? [module.liveBrowsers] : []));

/** What a tab is called: the page's title, else its address's host. */
export function pageName(title: string | undefined, url: string) {
  if (title) return title;
  try {
    // Only read once, to name the tab; nothing watches it change.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    return new URL(url).host || 'New tab';
  } catch {
    return 'New tab';
  }
}

/** The account's open browser sessions on its computers and the server, read again every few seconds. */
export class LiveBrowsers {
  sessions = $state<Watchable[]>([]);
  loaded = $state(false);

  /** The list being fetched: a refresh while one is on its way waits for it instead. */
  private fetching?: Promise<void>;

  /**
   * Reads every source again. A source that does not answer keeps its sessions for now, and the list
   * changes only when something in it did, so the tab being watched is left alone.
   */
  refresh(bases: string[]) {
    this.fetching ??= this.fetch(bases).finally(() => (this.fetching = undefined));
    return this.fetching;
  }

  private async fetch(bases: string[]) {
    const found = await Promise.all(
      bases.map((base) =>
        request<LiveSession[]>(base)
          .then((list) => list.flatMap((session) => tabsOf(session, base)))
          .catch(() => this.sessions.filter((session) => session.base === base)),
      ),
    );
    const next = found.flat();
    if (JSON.stringify(next) !== JSON.stringify(this.sessions)) this.sessions = next;
    this.loaded = true;
  }

  async control(page: Watchable, action: LiveControl) {
    await request(`${page.base}/${encodeURIComponent(page.key)}/${action}${tabQuery(page)}`, {
      method: 'POST',
      body: '{}',
    });
  }
}
