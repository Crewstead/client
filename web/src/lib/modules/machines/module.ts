import type { ClientModule } from '../types.ts';

export const machinesClient: ClientModule = {
  id: 'machines',
  liveBrowsers: '/machines/browser-live',
  tabs: [
    {
      id: 'projects',
      label: 'Projects',
      order: 15,
      load: () => import('./ProjectsSettings.svelte'),
    },
  ],
  panels: [
    { slot: 'personal-providers', order: 10, load: () => import('./ComputerGroups.svelte') },
  ],
  connectOptions: [
    {
      id: 'claude-code',
      label: 'Claude Code',
      hint: 'Runs on your computer and uses your Claude plan',
      description:
        'Crewstead runs Claude Code on your own computer, signed in with your own Claude account, for your Personal chats. It uses your Claude plan and its limits; only you can use it.',
      load: () => import('./ConnectComputer.svelte'),
    },
  ],
};
