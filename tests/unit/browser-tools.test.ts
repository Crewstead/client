import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { LiveEvent, ProjectRules } from '@crewstead/core/protocol';
import { BrowserPool, browserInstalled } from '@crewstead/core/browser';
import { writeConfig } from '../../daemon/src/config.ts';
import { runProjectTool } from '../../daemon/src/tools/run.ts';

/** A small app on this computer: a counter, a form, an error and a request to elsewhere. */
const PAGES: Record<string, string> = {
  '/': `<title>Shop</title><h1>Shop</h1>
    <button onclick="this.textContent = 'Added ' + (++window.n || (window.n = 1))">Add to cart</button>
    <form action="/search"><input name="q" aria-label="Search"></form>
    <script>console.error('cart failed to load'); fetch('/missing');</script>`,
  '/search': `<title>Results</title><p>Results</p>`,
  // Its script never yields, so nothing can be read from the page.
  '/busy': `<title>Busy</title><script>setTimeout(() => { for (;;); }, 50)</script>`,
  '/outside': `<title>Outside</title><img src="http://example.invalid/pixel.png" alt="pixel">`,
};

let server: Server;
let base: string;
let root: string;
const pool = new BrowserPool();

beforeAll(async () => {
  server = createServer((request, response) => {
    const page = PAGES[new URL(request.url!, 'http://x').pathname];
    response.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html' });
    response.end(page ?? 'Not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  root = await mkdtemp(join(tmpdir(), 'hub-browser-tools-'));
});
afterAll(async () => {
  await pool.closeAll();
  server.close();
  await rm(root, { recursive: true, force: true });
});

function project(rules: Partial<ProjectRules> = {}) {
  const home = join(root, randomUUID());
  writeConfig(home, {
    hub: 'http://127.0.0.1:1',
    token: 'unused',
    projects: [
      {
        id: 'shop1',
        name: 'Shop',
        path: root,
        rules: { commands: true, network: false, browser: true, ...rules },
      },
    ],
  });
  const session = randomUUID();
  return (name: string, args: object = {}) =>
    runProjectTool(
      { home, browser: pool },
      {
        type: 'tool',
        toolId: randomUUID(),
        projectId: 'shop1',
        name: name as never,
        arguments: JSON.stringify(args),
        session,
      },
      new AbortController().signal,
    );
}
const ref = (snapshot: string, text: string) =>
  new RegExp(`${text}[^\\n]*\\[ref=([a-z0-9]+)\\]`).exec(snapshot)?.[1] ?? 'missing';

it.skipIf(!browserInstalled())(
  'opens a local page, clicks and types by reference, and reports its errors',
  async () => {
    const tool = project();
    expect((await tool('browser_snapshot')).output).toBe(
      'The browser is not open. Use browser_open first.',
    );
    expect((await tool('browser_screenshot')).output).toBe(
      'The browser is not open. Use browser_open first.',
    );
    const opened = await tool('browser_open', { url: base });
    expect(opened.isError).toBe(false);
    expect(opened.output).toContain(`Address: ${base}/`);
    expect(opened.output).toContain('Title: Shop');
    expect(opened.output).toContain('heading "Shop" [level=1]');

    const clicked = await tool('browser_click', {
      element: 'Add to cart button',
      ref: ref(opened.output, 'button "Add to cart"'),
    });
    expect(clicked.output).toContain('button "Added 1"');

    const typed = await tool('browser_type', {
      element: 'Search field',
      ref: ref(clicked.output, 'textbox "Search"'),
      text: 'socks',
      submit: true,
    });
    expect(typed.output).toContain(`Address: ${base}/search?q=socks`);
    expect(typed.output).toContain('Title: Results');

    const shot = await tool('browser_screenshot');
    expect(shot.output).toBe(
      `Screenshot of the visible page (1280×800) at ${base}/search?q=socks.`,
    );
    expect(shot.image).toMatchObject({
      mediaType: 'image/jpeg',
      data: expect.stringMatching(/^\/9j\//),
    });
    const heading = await tool('browser_screenshot', {
      element: 'Results text',
      ref: ref((await tool('browser_snapshot')).output, 'paragraph'),
    });
    expect(heading.output).toMatch(/^Screenshot of Results text at /);
    expect(Buffer.from(heading.image!.data, 'base64').length).toBeLessThan(
      Buffer.from(shot.image!.data, 'base64').length,
    );

    const logs = (await tool('browser_logs')).output;
    expect(logs).toContain('Console error: cart failed to load');
    expect(logs).toMatch(/HTTP 404: GET .*\/missing/);
    expect((await tool('browser_logs')).output).toBe('No errors since the last check.');

    // A stale reference fails with a short message, not Playwright's call log.
    const stale = await tool('browser_click', { element: 'Old button', ref: 'e999' });
    expect(stale).toMatchObject({
      isError: true,
      output: 'No element e999 on the page now. Take a new snapshot.',
    });

    expect((await tool('browser_close')).output).toBe('Closed the browser.');
    expect((await tool('browser_logs')).output).toMatch(/not open/);
  },
);

it.skipIf(!browserInstalled())(
  'keeps chats apart and stays on this computer without network permission',
  async () => {
    const first = project();
    const second = project();
    await first('browser_open', { url: base });
    expect((await second('browser_snapshot')).isError).toBe(true);

    expect((await first('browser_open', { url: 'https://example.com' })).output).toMatch(
      /^This address can't be opened: no network permission for this project/,
    );
    expect((await first('browser_open', { url: 'file:///etc/passwd' })).output).toBe(
      'Only http and https addresses can be opened.',
    );
    // A local page cannot load anything from elsewhere either.
    await first('browser_logs');
    await first('browser_open', { url: `${base}/outside` });
    expect((await first('browser_logs')).output).toContain(
      'Blocked (no network permission for this project): http://example.invalid/pixel.png',
    );
    await first('browser_close');
  },
);

it('refuses the browser when the project turned it off, whatever the hub sends', async () => {
  const tool = project({ browser: false });
  expect(await tool('browser_open', { url: base })).toMatchObject({
    isError: true,
    output: 'The browser is turned off for this project.',
  });
});

it.skipIf(!browserInstalled())(
  'lists its sessions at once, even with a page that hangs',
  async () => {
    const tool = project();
    await tool('browser_open', { url: `${base}/busy` });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const started = Date.now();
    const busy = (await pool.sessions()).find((session) => session.url === `${base}/busy`);
    expect(busy).toMatchObject({ title: '' });
    expect(Date.now() - started).toBeLessThan(5_000);
    await tool('browser_close');
  },
  // Opening the hanging page waits out the snapshot's own 10 seconds; a busy runner needs the rest.
  30_000,
);

it.skipIf(!browserInstalled())(
  'streams a session live: its page, frames, where the model clicks, and when it closes',
  async () => {
    const tool = project();
    await tool('browser_open', { url: base });
    const key = [...(await pool.sessions())].at(-1)!.key;
    const events: LiveEvent[] = [];
    const stop = await pool.watch(key, (event) => events.push(event));
    await vi.waitFor(() => expect(events.some((event) => event.type === 'frame')).toBe(true));
    expect(events[0]).toMatchObject({ type: 'page', url: `${base}/`, title: 'Shop', tabs: 1 });
    const snapshot = (await tool('browser_snapshot')).output;
    await tool('browser_click', { element: 'Add', ref: ref(snapshot, 'button "Add to cart"') });
    const cursor = events.find((event) => event.type === 'cursor');
    expect(cursor).toMatchObject({ type: 'cursor', kind: 'click' });
    await pool.control(key, 'reload');
    stop();
    const later: LiveEvent[] = [];
    await pool.watch(key, (event) => later.push(event));
    await tool('browser_close');
    expect(later.at(-1)).toEqual({ type: 'closed' });
  },
);

it.skipIf(!browserInstalled())(
  'takes clicks, keys and text from the owner, and tells the model afterwards',
  async () => {
    const tool = project();
    await tool('browser_open', { url: base });
    const key = [...(await pool.sessions())].at(-1)!.key;
    const chat = await pool.page(key, false);
    const button = await chat.page.getByRole('button', { name: 'Add to cart' }).boundingBox();
    await pool.input(key, {
      type: 'click',
      x: button!.x + 5,
      y: button!.y + 5,
      button: 'left',
      count: 1,
    });
    await vi.waitFor(async () =>
      expect(await chat.page.getByRole('button', { name: 'Added 1' }).count()).toBe(1),
    );
    const field = await chat.page.getByRole('textbox', { name: 'Search' }).boundingBox();
    await pool.input(key, {
      type: 'click',
      x: field!.x + 5,
      y: field!.y + 5,
      button: 'left',
      count: 1,
    });
    await pool.input(key, { type: 'text', text: 'hats' });
    await pool.input(key, { type: 'key', key: 'Enter' });
    await vi.waitFor(() => expect(chat.page.url()).toBe(`${base}/search?q=hats`));
    const look = (await tool('browser_snapshot')).output;
    expect(look).toMatch(/^The owner used this browser by hand since you last looked/);
    expect((await tool('browser_snapshot')).output).not.toContain('The owner used');
    await tool('browser_close');
  },
);

it.skipIf(!browserInstalled())(
  'opens pages in new tabs, lists and switches them, and closes one tab or the whole browser',
  async () => {
    const tool = project();
    await tool('browser_open', { url: base });
    const second = await tool('browser_open', { url: `${base}/search?q=cats`, new_tab: true });
    expect(second.output).toContain('Title: Results');
    expect(second.output).toContain('Tab: t2 of 2 (browser_tabs lists all)');
    expect((await tool('browser_tabs')).output).toBe(
      `t1: Shop — ${base}/\nt2 (current): Results — ${base}/search?q=cats`,
    );
    // The live view can watch a tab the model is not working in.
    const key = (await pool.sessions()).find((session) => session.tabs.length === 2)!.key;
    const seen: LiveEvent[] = [];
    const stop = await pool.watch(key, (event) => seen.push(event), 't1');
    expect(seen[0]).toMatchObject({ type: 'page', title: 'Shop', tabs: 2 });
    stop();
    const back = await tool('browser_switch_tab', { tab: 't1' });
    expect(back.output).toContain('Title: Shop');
    expect((await tool('browser_switch_tab', { tab: 't9' })).output).toBe(
      'There is no tab t9. Open tabs: t1, t2.',
    );
    expect((await tool('browser_close', { tab: 't1' })).output).toBe(
      `Closed tab t1. Now on tab t2: Results — ${base}/search?q=cats`,
    );
    expect((await tool('browser_close', { tab: 't2' })).output).toBe(
      'Closed tab t2, its last one, so the browser closed.',
    );
    expect((await tool('browser_tabs')).output).toMatch(/not open/);
  },
);

it.skipIf(!browserInstalled())(
  'opens separate browsers for one chat: tabs share a profile, browsers do not',
  async () => {
    const tool = project();
    const cookie = (output: string) => output;
    await tool('browser_open', { url: base });
    const chat = (await pool.sessions()).at(-1)!.key.replace(/#b1$/, '');
    const first = await pool.page(`${chat}#b1`, false);
    await first.page.evaluate(() => (document.cookie = 'pet=dog'));
    const other = await tool('browser_open', { url: `${base}/search?q=cats`, new_browser: true });
    expect(other.output).toContain('Browser: b2 · Tab: t1 of 1');
    const second = await pool.page(`${chat}#b2`, false);
    expect(await second.page.evaluate(() => document.cookie)).toBe('');
    // A tab of the first browser shares its cookies.
    await tool('browser_switch_tab', { browser: 'b1', tab: 't1' });
    await tool('browser_open', { url: `${base}/search?q=dogs`, new_tab: true });
    const tab = (await pool.page(`${chat}#b1`, false)).page;
    expect(cookie(await tab.evaluate(() => document.cookie))).toBe('pet=dog');
    expect((await tool('browser_tabs')).output).toBe(
      [
        'Browser b1 (current):',
        `  t1: Shop — ${base}/`,
        `  t2 (current): Results — ${base}/search?q=dogs`,
        'Browser b2:',
        `  t1 (current): Results — ${base}/search?q=cats`,
      ].join('\n'),
    );
    expect((await tool('browser_switch_tab', { browser: 'b7', tab: 't1' })).output).toBe(
      'There is no browser b7. Open: b1, b2.',
    );
    expect((await tool('browser_close', { browser: 'b1' })).output).toBe(
      'Closed browser b1. Still open: b2; now using b2.',
    );
    expect((await tool('browser_snapshot')).output).toContain('search?q=cats');
    await tool('browser_close');
  },
);
