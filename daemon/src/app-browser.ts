import { readFileSync } from 'node:fs';
import type { BrowserPool, TabHost } from '@crewstead/core/browser';
import { appLink } from './app-link.ts';

/**
 * Run by the desktop app: the browser tools use the app's own browser, whose tabs show in its window
 * (desktop/src/browser-tabs.ts). The app opens Chromium's DevTools endpoint on this computer only
 * and names its file in CREWSTEAD_APP_DEVTOOLS; requests go both ways over the IPC channel.
 */
export function appBrowser(): { host: TabHost; serve: (pool: BrowserPool) => void } | undefined {
  const file = process.env.CREWSTEAD_APP_DEVTOOLS;
  if (process.env.CREWSTEAD_APP_PIPE !== '1' || !file || !process.send) return undefined;
  let pool: BrowserPool | undefined;
  const link = appLink(
    (message) => process.send?.(message),
    async (op, args) => {
      // Which tab to show for a browser of a chat (its current one), when this computer has it.
      if (op === 'browser-current') {
        const { key, tab } = args as { key?: unknown; tab?: unknown };
        return pool?.currentTarget(String(key ?? ''), typeof tab === 'string' ? tab : undefined);
      }
      throw new Error(`Unknown request: ${op}`);
    },
  );
  process.on('message', (message) => link.receive(message));
  process.on('disconnect', () => link.drop());
  const host: TabHost = {
    async endpoint() {
      // Chromium writes its port and path there once it listens.
      const [port, path] = readFileSync(file, 'utf8').split('\n');
      if (!port || !path) throw new Error('The Crewstead app has no browser to use yet.');
      return `ws://127.0.0.1:${port.trim()}${path.trim()}`;
    },
    open: async (owner) => String(await link.ask('browser-open', { owner })),
    async capture(target, quality, clip) {
      return Buffer.from(
        String(await link.ask('browser-capture', { target, quality, clip })),
        'base64',
      );
    },
  };
  return { host, serve: (served) => (pool = served) };
}
