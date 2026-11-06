import { createServer, type Server } from 'node:http';

/**
 * The return page on this computer for MCP sign-ins whose service only sends people back to
 * localhost. The hub registers `http://localhost:<PORT>/mcp-oauth/callback` for such a sign-in
 * (server sign-in-routes.ts); the service sends the owner's browser here, and this page forwards
 * the answer as it came to the hub's own return page, which finishes the sign-in. Nothing is kept
 * here: the hub alone holds the sign-in's state and proof.
 */

/** Fixed, so a service that keeps the registered address sees the same one every time. */
export const PORT = 47_821;
const PATH = '/mcp-oauth/callback';
/** As long as the hub waits for the owner to approve. */
const OPEN_MS = 10 * 60_000;

let servers: Server[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let hub = '';

/** Closes the return page (it also closes by itself). */
export function closeReturn() {
  clearTimeout(timer);
  timer = undefined;
  for (const server of servers) server.close();
  servers = [];
}

function listen(host: string) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
    if (request.method !== 'GET' || url.pathname !== PATH || !hub) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(302, {
      Location: `${hub}/api/mcp-oauth/callback${url.search}`,
      'Cache-Control': 'no-store',
    });
    response.end();
  });
  return new Promise<Server>((done, fail) => {
    server.once('error', fail);
    server.listen(PORT, host, () => done(server));
  });
}

/**
 * Opens the return page for a sign-in started at `address` (the hub's origin), for 10 minutes
 * from the latest start; resolves its port, or rejects when the port is taken.
 */
export async function openReturn(address: string) {
  hub = address;
  if (!servers.length) {
    // `localhost` may mean either address in the owner's browser; IPv6 is optional.
    servers = [await listen('127.0.0.1')];
    await listen('::1').then(
      (server) => servers.push(server),
      () => {},
    );
  }
  clearTimeout(timer);
  timer = setTimeout(closeReturn, OPEN_MS);
  timer.unref();
  return PORT;
}
