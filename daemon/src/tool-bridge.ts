import { createServer, type Socket } from 'node:net';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { MachineImage, MachineTool } from '@crewstead/core/protocol';

/** The answer Claude Code gets for one tool call. */
export interface ToolAnswer {
  text: string;
  isError: boolean;
  /** Pictures the tool took, e.g. a browser screenshot. */
  images?: MachineImage[];
}

/**
 * A private socket for one reply's MCP bridge (mcp-bridge.mjs, started by Claude Code). Each tool
 * call it forwards goes to `onCall`, which resolves once the hub has the result.
 */
export async function openToolBridge(
  folder: string,
  tools: MachineTool[],
  onCall: (name: string, args: string) => Promise<ToolAnswer>,
) {
  const path = join(folder, `bridge-${randomBytes(6).toString('hex')}.sock`);
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const lines = createInterface({ input: socket });
    // Claude Code stopped mid-call (e.g. the reply was cancelled); readline passes the reset on, and
    // `close` follows and cleans up.
    lines.on('error', () => {});
    lines.on('line', async (line) => {
      const request = JSON.parse(line) as { id: number; name: string; arguments: string };
      const answer = await onCall(request.name, request.arguments).catch(
        (error: unknown): ToolAnswer => ({
          text: error instanceof Error ? error.message : 'The tool failed.',
          isError: true,
        }),
      );
      if (!socket.destroyed) socket.write(`${JSON.stringify({ id: request.id, ...answer })}\n`);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ path, readableAll: false, writableAll: false }, resolve);
  });
  const config = JSON.stringify({
    mcpServers: {
      hub: {
        command: process.execPath,
        args: [fileURLToPath(new URL('./mcp-bridge.mjs', import.meta.url))],
        env: {
          HUB_BRIDGE_SOCKET: path,
          HUB_BRIDGE_TOOLS: JSON.stringify(tools),
          // Inside the desktop app this program is Electron, which runs scripts only as Node.
          ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        },
      },
    },
  });
  return {
    /** Value for `--mcp-config`. */
    config,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
      await rm(path, { force: true });
    },
  };
}
