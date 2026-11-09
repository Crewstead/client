import type { ClientModule } from '../types.ts';

export const mcpServersClient: ClientModule = {
  id: 'mcp-servers',
  tabs: [
    {
      id: 'mcp',
      label: 'MCP servers',
      group: 'tools',
      order: 30,
      load: () => import('./McpSettings.svelte'),
    },
  ],
};
