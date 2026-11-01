import type { ClientModule } from '../types.ts';

export const cloudSandboxClient: ClientModule = {
  id: 'cloud-sandbox',
  panels: [{ slot: 'chats', order: 20, load: () => import('./CloudSandboxSettings.svelte') }],
};
