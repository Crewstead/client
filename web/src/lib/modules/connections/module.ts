import type { ClientModule } from '../types.ts';

export const connectionsClient: ClientModule = {
  id: 'connections',
  pages: [{ section: 'providers', load: () => import('./ProviderPage.svelte') }],
  panels: [
    { slot: 'personal-models', order: 20, load: () => import('./PersonalModels.svelte') },
    { slot: 'workspace', order: 20, load: () => import('./WorkspaceModels.svelte') },
  ],
};
