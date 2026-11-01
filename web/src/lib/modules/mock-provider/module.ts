import type { ClientModule } from '../types.ts';

export const mockProviderClient: ClientModule = {
  id: 'mock-provider',
  panels: [{ slot: 'models', order: 90, load: () => import('./DevelopmentPanel.svelte') }],
};
