import type { ClientModule } from '../types.ts';

export const webSearchClient: ClientModule = {
  id: 'web-search',
  panels: [{ slot: 'chats', order: 5, load: () => import('./WebSearchSettings.svelte') }],
};
