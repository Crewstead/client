import type { ClientModule } from '../types.ts';

export const cloudSandboxClient: ClientModule = {
  id: 'cloud-sandbox',
  panels: [{ slot: 'tools', order: 20, load: () => import('./CloudSandboxSettings.svelte') }],
};
