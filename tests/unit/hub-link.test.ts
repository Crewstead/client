import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { keepLinked } from '../../daemon/src/link.ts';

let root: string | undefined;
let hub: Server | undefined;
afterEach(async () => {
  hub?.closeAllConnections();
  await new Promise((done) => hub?.close(done) ?? done(undefined));
  if (root) await rm(root, { recursive: true, force: true });
});

it('starts over when connecting hangs, so this computer does not stay offline', async () => {
  root = await mkdtemp(join(tmpdir(), 'hub-link-'));
  let hellos = 0;
  // A hub that never answers the first hello (as a stuck request would), then answers normally.
  hub = createServer((request, response) => {
    if (request.url === '/api/machine/hello' && ++hellos === 1) return;
    if (request.url === '/api/machine/link') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(': open\n\n');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
  });
  await new Promise<void>((done) => hub!.listen(0, '127.0.0.1', done));
  const { port } = hub.address() as AddressInfo;
  const lines: string[] = [];
  const controller = new AbortController();
  const linked = keepLinked({
    config: { hub: `http://127.0.0.1:${port}`, token: 'ahm_test' },
    claude: join(root, 'no-claude'),
    work: join(root, 'work'),
    log: (line) => lines.push(line),
    signal: controller.signal,
    tools: { home: root, sandbox: false },
    connectMs: 500,
  });
  await vi.waitFor(() => expect(lines.some((line) => line.startsWith('Connected to'))).toBe(true), {
    timeout: 8_000,
  });
  expect(lines[0]).toBe('Lost the hub connection (connecting took too long).');
  expect(hellos).toBeGreaterThanOrEqual(2);
  controller.abort();
  await linked;
}, 15_000);
