import type { ClientModule } from '../types.ts';

export const mcpServersClient: ClientModule = {
  id: 'mcp-servers',
  tabs: [
    { id: 'mcp', label: 'MCP servers', order: 19, load: () => import('./McpSettings.svelte') },
  ],
};
