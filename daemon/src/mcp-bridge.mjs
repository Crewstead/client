#!/usr/bin/env node
// MCP server that Claude Code starts for one reply. It offers the hub's tools (HUB_BRIDGE_TOOLS_FILE) and
// passes every call to the daemon over a private Unix socket (HUB_BRIDGE_SOCKET); the daemon asks the
// hub, which runs the tool after the owner's approval. Plain JavaScript, so it starts without a build.
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { createInterface } from 'node:readline';

// A file, not the environment: Windows limits a variable to 32,767 characters.
const tools = JSON.parse(readFileSync(process.env.HUB_BRIDGE_TOOLS_FILE ?? '', 'utf8'));
const daemon = connect(process.env.HUB_BRIDGE_SOCKET ?? '');
const waiting = new Map();
let next = 0;
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

createInterface({ input: daemon }).on('line', (line) => {
  const answer = JSON.parse(line);
  waiting.get(answer.id)?.(answer);
  waiting.delete(answer.id);
});
daemon.on('error', () => process.exit(1));

function call(name, args) {
  const id = ++next;
  daemon.write(`${JSON.stringify({ id, name, arguments: JSON.stringify(args ?? {}) })}\n`);
  return new Promise((resolve) => waiting.set(id, resolve));
}

createInterface({ input: process.stdin }).on('line', async (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = request;
  if (id === undefined) return; // notifications need no answer
  if (method === 'initialize')
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'crewstead', version: '0.1.0' },
      },
    });
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list')
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters,
        })),
      },
    });
  if (method === 'tools/call') {
    const answer = await call(params?.name, params?.arguments);
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          { type: 'text', text: answer.text },
          ...(answer.images ?? []).map((image) => ({
            type: 'image',
            data: image.data,
            mimeType: image.mediaType,
          })),
        ],
        isError: answer.isError,
      },
    });
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method ${method}` } });
});
process.stdin.on('end', () => process.exit(0));
