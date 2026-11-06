import type { CreateMcpServer, McpServer, UpdateMcpServer } from '@crewstead/core/protocol';
import { request } from '#lib/api.ts';

/** The account's MCP servers. Adding or changing an address or headers checks the server at once. */
export const mcpServers = {
  list: () => request<McpServer[]>('/mcp-servers'),
  create: (input: CreateMcpServer) =>
    request<McpServer>('/mcp-servers', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, patch: UpdateMcpServer) =>
    request<McpServer>(`/mcp-servers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  check: (id: string) => request<McpServer>(`/mcp-servers/${id}/check`, { method: 'POST' }),
  remove: (id: string) => request(`/mcp-servers/${id}`, { method: 'DELETE' }),
  /**
   * The service's own sign-in page for a server that signs its users in; with `loopback`, it sends
   * the owner back through the desktop app's return page at that port on their computer.
   */
  signIn: (id: string, loopback?: number) =>
    request<{ url: string }>(`/mcp-servers/${id}/sign-in`, {
      method: 'POST',
      ...(loopback ? { body: JSON.stringify({ loopback }) } : {}),
    }),
  signOut: (id: string) => request(`/mcp-servers/${id}/sign-out`, { method: 'POST' }),
};
