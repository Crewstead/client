import type { ClientModule } from '../types.ts';

export const organisationsClient: ClientModule = {
  id: 'organisations',
  tabs: [
    {
      id: 'organisations',
      label: 'Organisations',
      group: 'people',
      order: 20,
      load: () => import('./OrganisationSettings.svelte'),
    },
  ],
  pages: [{ section: 'organisations', load: () => import('./OrganisationPage.svelte') }],
  workspaceActions: [{ label: 'New organisation', href: '/settings?tab=organisations' }],
};
