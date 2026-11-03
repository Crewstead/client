import { app, type Session } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { SavedReplies } from './saved-replies.ts';

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
/** How long the hub's answer about its interface version is trusted before asking again. */
const VERSION_MS = 60_000;
const HEALTH_MS = 3_000;

export type HubState = 'online' | 'offline';

/**
 * The window's interface comes from this app, not the hub. The window still shows the hub's address,
 * so sign-in, cookies and sign-in callbacks are unchanged; but every request there outside `/api` is
 * answered from the interface built into the app (build/web). The app therefore opens at once and
 * without the hub, showing saved copies of what it last saw (see SavedReplies).
 *
 * The built-in interface is used while the hub runs the same minor version (patches stay compatible
 * both ways, `docs/plan/28-distribution.md`). When they differ, an app update or a hub deploy is due,
 * and the window shows the hub's own interface until they match again.
 */
export function serveInterface(
  session: Session,
  hub: () => string | undefined,
  changed: (state: HubState) => void,
) {
  const root = resolve(__dirname, 'web');
  const saved = new SavedReplies(resolve(app.getPath('userData'), 'saved-replies'));
  const ours = app.isPackaged ? minor(app.getVersion()) : undefined;
  let known: { hub: string; local: boolean; at: number } | undefined;
  let local = true;
  let state: HubState | undefined;
  const report = (next: HubState) => {
    if (next !== state) changed((state = next));
  };
  const onward = (request: Request) =>
    session.fetch(request, { bypassCustomProtocolHandlers: true });

  // Whether this hub's interface matches the built-in one; an unreachable hub gets the built-in one.
  async function matches(address: string) {
    if (known?.hub === address && Date.now() - known.at < VERSION_MS) return known.local;
    let theirs: string | undefined;
    try {
      const response = await onward(
        new Request(`${address}/api/health`, { signal: AbortSignal.timeout(HEALTH_MS) }),
      );
      theirs = ((await response.json()) as { client?: string }).client;
    } catch {
      // Unreachable: the built-in interface, asking again on the next page.
      return true;
    }
    // A development app, or a hub that does not say, uses the built-in interface.
    const result = !ours || !theirs || minor(theirs) === ours;
    known = { hub: address, local: result, at: Date.now() };
    return result;
  }

  async function file(path: string) {
    const target = resolve(root, `.${path}`);
    if (target !== root && !target.startsWith(root + sep)) return undefined;
    const found = await stat(target).catch(() => undefined);
    return found?.isFile() ? target : undefined;
  }

  async function answer(request: Request) {
    const address = hub();
    const url = new URL(request.url);
    if (!address || url.origin !== address) return onward(request);
    const path = decodeURIComponent(url.pathname);
    if (path === '/api' || path.startsWith('/api/')) return api(request, path);
    // A page (a route, or the page itself) decides where this load's files come from.
    const page = !extname(path) || path.endsWith('.html');
    if (page) local = await matches(address);
    if (!local) return onward(request);
    const found = (await file(path)) ?? (page ? resolve(root, 'index.html') : undefined);
    if (!found) return onward(request);
    return new Response(await readFile(found), {
      headers: { 'Content-Type': types[extname(found)] ?? 'application/octet-stream' },
    });
  }

  async function api(request: Request, path: string) {
    const account = request.headers.get('X-Hub-Account') ?? '';
    const keep = request.method === 'GET' && SavedReplies.worthKeeping(path);
    try {
      const response = await onward(request);
      report('online');
      if (keep && response.ok) return saved.keep(account, request.url, response);
      if (path === '/api/auth/logout' && response.ok) await saved.clear();
      return response;
    } catch (error) {
      if (request.signal.aborted) throw error;
      report('offline');
      const copy = keep ? await saved.find(account, request.url) : undefined;
      if (copy) return copy;
      return Response.json({ message: 'The hub cannot be reached.' }, { status: 503 });
    }
  }

  for (const scheme of ['https', 'http'])
    session.protocol.handle(scheme, (request) => answer(request));
  return { state: () => state };
}

function minor(version: string) {
  const [major, second] = version.replace(/^v/, '').split('.');
  return `${major}.${second}`;
}
