import { CalendarClock } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';

export const scheduledTasksClient: ClientModule = {
  id: 'scheduled-tasks',
  tabs: [
    {
      id: 'scheduled',
      label: 'Scheduled',
      group: 'chats',
      order: 19,
      load: () => import('./TasksSettings.svelte'),
    },
  ],
  sidebarLinks: [{ label: 'Scheduled', href: '/settings?tab=scheduled', icon: CalendarClock }],
  panels: [{ slot: 'chat-panel', order: 20, load: () => import('./PanelTasks.svelte') }],
};
