import { dialog, session as sessions, type BrowserWindow } from 'electron';
import { PARTITION } from '../browser-tabs.ts';
import { chromeCookies, chromeSites } from './chrome-cookies.ts';
import { chromeSources, siteOf } from './chrome-sources.ts';

/**
 * The browser's site data, managed from Settings in this app's own window: what sites it holds and
 * removing one; and copying chosen sites' cookies (their sign-ins) from another browser on this
 * computer. Cookies go straight from that browser's files into this browser's profile: they are
 * never sent anywhere (the hub included), logged or kept elsewhere. Every import asks first.
 */
export class SiteData {
  constructor(private window: () => BrowserWindow) {}

  private get store() {
    return sessions.fromPartition(PARTITION);
  }

  /** The sites with cookies in this browser, and how many each. */
  async kept() {
    const counts = new Map<string, number>();
    for (const cookie of await this.store.cookies.get({})) {
      const site = siteOf(cookie.domain ?? '');
      if (site) counts.set(site, (counts.get(site) ?? 0) + 1);
    }
    return [...counts]
      .map(([site, cookies]) => ({ site, cookies }))
      .sort((a, b) => a.site.localeCompare(b.site));
  }

  /** Removes a site's cookies and the rest of what its pages stored (storage, cache, databases). */
  async remove(site: string) {
    const cookies = (await this.store.cookies.get({})).filter(
      (cookie) => siteOf(cookie.domain ?? '') === site,
    );
    const hosts = new Set<string>([site, `www.${site}`]);
    for (const cookie of cookies) {
      const host = (cookie.domain ?? '').replace(/^\./, '');
      hosts.add(host);
      await this.store.cookies
        .remove(`${cookie.secure ? 'https' : 'http'}://${host}${cookie.path ?? '/'}`, cookie.name)
        .catch(() => {});
    }
    for (const host of hosts)
      for (const scheme of ['https', 'http'])
        await this.store.clearStorageData({ origin: `${scheme}://${host}` }).catch(() => {});
  }

  /** Other browsers' profiles on this computer that can be imported from. */
  sources() {
    return chromeSources().map(({ id, label }) => ({ id, label }));
  }

  /** A profile's sites and how many cookies each: names only, nothing is decrypted. */
  sites(sourceId: string) {
    return chromeSites(this.source(sourceId));
  }

  /** Copies the chosen sites' cookies into this browser, once its owner agrees here. */
  async import(sourceId: string, sites: string[]) {
    const source = this.source(sourceId);
    const chosen = [...new Set(sites)].filter((site) => typeof site === 'string' && site);
    if (!chosen.length) return { imported: 0, skipped: 0, cancelled: false };
    const listed = chosen.slice(0, 8).join(', ') + (chosen.length > 8 ? ', …' : '');
    const { response } = await dialog.showMessageBox(this.window(), {
      type: 'question',
      buttons: ['Import', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Import sign-ins',
      message: `Copy ${chosen.length === 1 ? 'this site' : `${chosen.length} sites`} from ${source.label} into Crewstead's browser?`,
      detail:
        `${listed}\n\nTheir cookies, sign-ins included, are copied on this computer only. Chats ` +
        `that use Crewstead's browser can then act on these sites as you.`,
    });
    if (response !== 0) return { imported: 0, skipped: 0, cancelled: true };
    const { cookies, skipped } = await chromeCookies(source, chosen);
    let imported = 0;
    let failed = 0;
    for (const cookie of cookies) {
      try {
        await this.store.cookies.set(cookie);
        imported++;
      } catch {
        failed++;
      }
    }
    await this.store.cookies.flushStore();
    return { imported, skipped: skipped + failed, cancelled: false };
  }

  private source(id: string) {
    const found = chromeSources().find((source) => source.id === id);
    if (!found) throw new Error('That browser profile is not on this computer any more.');
    return found;
  }
}
