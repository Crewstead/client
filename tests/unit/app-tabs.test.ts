import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { BrowserPool, browserInstalled, type TabHost } from '@crewstead/core/browser';

/** A page that sets a cookie, one that shows it, and one that opens a popup. */
const PAGES: Record<string, string> = {
  '/login': `<title>Login</title><script>document.cookie = 'signed=yes; max-age=3600'</script>`,
  '/me': `<title>Me</title><p id="who"></p><script>who.textContent = document.cookie || 'nobody'</script>`,
  '/popup': `<title>Opener</title><a href="/me" target="_blank">Open</a>`,
};

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    const page = PAGES[new URL(request.url!, 'http://x').pathname];
    response.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html' });
    response.end(page ?? 'Not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  dir = await mkdtemp(join(tmpdir(), 'hub-app-tabs-'));
});
afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

/**
 * A stand-in for the desktop app: a Chromium with its DevTools endpoint open, a page of its own (the
 * app's window), and tabs it opens when asked.
 */
async function fakeApp() {
  const app: BrowserContext = await chromium.launchPersistentContext(join(dir, 'app'), {
    args: ['--remote-debugging-port=0'],
  });
  const own = app.pages()[0] ?? (await app.newPage());
  await own.goto('data:text/html,<title>App window</title>');
  let opened = 0;
  const host: TabHost = {
    async endpoint() {
      const [port, path] = (await readFile(join(dir, 'app', 'DevToolsActivePort'), 'utf8')).split(
        '\n',
      );
      return `ws://127.0.0.1:${port}${path}`;
    },
    async open() {
      const address = `about:blank#crewstead-${++opened}`;
      await (await app.newPage()).goto(address);
      return address;
    },
    async capture() {
      return own.screenshot({ type: 'jpeg' });
    },
  };
  return { app, own, host };
}

it.skipIf(!browserInstalled())(
  "uses the app's tabs: one kept profile, each chat its own tabs, the app's window untouched",
  async () => {
    const { app, own, host } = await fakeApp();
    const pool = new BrowserPool({ host });
    const a = await pool.page('chat-a#b1', false);
    await a.page.goto(`${base}/login`);
    // Another chat shares the app's profile: it is signed in too, in a tab of its own.
    const b = await pool.page('chat-b#b1', false);
    await b.page.goto(`${base}/me`);
    expect(await b.page.locator('#who').textContent()).toBe('signed=yes');
    expect(a.tabs).toHaveLength(1);
    expect(b.tabs).toHaveLength(1);

    // A popup belongs to the chat whose page opened it.
    await a.page.goto(`${base}/popup`);
    await a.page.getByRole('link', { name: 'Open' }).click();
    await expect.poll(() => a.tabs.length).toBe(2);
    expect(b.tabs).toHaveLength(1);

    // The policy applies to a chat's tabs (no network: other computers are refused)...
    await b.page.goto('http://example.invalid/').catch(() => {});
    expect(b.logs.some((line) => line.startsWith('Blocked'))).toBe(true);
    // ...and never to the app's own window.
    const failed: string[] = [];
    own.on('requestfailed', (request: { failure(): { errorText: string } | null }) =>
      failed.push(request.failure()?.errorText ?? ''),
    );
    await own.goto('http://example.invalid/').catch(() => {});
    expect(failed.some((reason) => reason.includes('BLOCKED_BY_CLIENT'))).toBe(false);

    // The app knows a browser's current tab by Chromium's target id, and draws its pictures.
    expect(await pool.currentTarget('chat-b#b1')).toMatch(/^[0-9A-F]{32}$/);
    expect((await b.capture!(80)).length).toBeGreaterThan(0);

    // Closing one chat's browser closes its tabs only.
    const before = app.pages().length;
    await pool.close('chat-a#b1');
    expect(app.pages().length).toBe(before - 2);
    expect(pool.has('chat-b#b1')).toBe(true);

    // The app quitting ends its sessions; they open again on the next call.
    await app.close();
    await expect.poll(() => pool.has('chat-b#b1')).toBe(false);
    await pool.closeAll();
  },
  60_000,
);
