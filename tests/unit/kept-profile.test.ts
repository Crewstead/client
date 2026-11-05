import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { BrowserPool, browserInstalled } from '@crewstead/core/browser';

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
  dir = await mkdtemp(join(tmpdir(), 'hub-kept-profile-'));
});
afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

// Headless here; the desktop app shows the same browser as a window.
const pool = () => new BrowserPool({ profile: { dir: join(dir, 'profile'), visible: false } });
const who = async (page: Awaited<ReturnType<BrowserPool['page']>>['page']) =>
  page.locator('#who').textContent();

it.skipIf(!browserInstalled())(
  'keeps sign-ins across chats and restarts, while each chat keeps its own tabs',
  async () => {
    const first = pool();
    const a = await first.page('chat-a#b1', false);
    await a.page.goto(`${base}/login`);
    // Another chat shares the profile: it is signed in too, in a tab of its own.
    const b = await first.page('chat-b#b1', false);
    await b.page.goto(`${base}/me`);
    expect(await who(b.page)).toBe('signed=yes');
    expect(a.tabs).toHaveLength(1);
    expect(b.tabs).toHaveLength(1);

    // A popup belongs to the chat whose page opened it.
    await a.page.goto(`${base}/popup`);
    await a.page.getByRole('link', { name: 'Open' }).click();
    await expect.poll(() => a.tabs.length).toBe(2);
    expect(b.tabs).toHaveLength(1);

    // The policy still applies to a chat's tabs: no network, so other computers are refused.
    await a.page.goto('http://example.invalid/').catch(() => {});
    expect(a.logs.some((line) => line.startsWith('Blocked'))).toBe(true);

    // Closing one chat's browser leaves the other's open.
    await first.close('chat-a#b1');
    expect(first.has('chat-b#b1')).toBe(true);
    await b.page.reload();
    expect(await who(b.page)).toBe('signed=yes');
    await first.closeAll();

    // After a restart the sign-in is still there.
    const second = pool();
    const c = await second.page('chat-c#b1', false);
    await c.page.goto(`${base}/me`);
    expect(await who(c.page)).toBe('signed=yes');
    await second.closeAll();
  },
  60_000,
);
