import type { ClientModule } from '../types.ts';

export const mockProviderClient: ClientModule = {
  id: 'mock-provider',
  tabs: [
    {
      id: 'developer',
      label: 'Test replies',
      group: 'developer',
      order: 10,
      load: () => import('./DevelopmentPanel.svelte'),
    },
  ],
};
