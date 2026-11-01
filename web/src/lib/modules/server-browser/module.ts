import type { ClientModule } from '../types.ts';

export const serverBrowserClient: ClientModule = {
  id: 'server-browser',
  liveBrowsers: '/server-browser/live',
  panels: [{ slot: 'chats', order: 10, load: () => import('./ServerBrowserSettings.svelte') }],
};
