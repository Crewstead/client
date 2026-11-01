import type { ModuleInfo } from '@crewstead/core/protocol';
import { activeModules } from '#lib/modules/registry.ts';
import type { SettingsTab } from '#lib/modules/types.ts';

// Core categories; running modules add their own tabs through their descriptors.
const core: SettingsTab[] = [
  { id: 'models', label: 'Models', order: 10, load: () => import('./ModelsSettings.svelte') },
  {
    id: 'chats',
    label: 'Chats',
    order: 30,
    load: () => import('./ChatsSettings.svelte'),
  },
  { id: 'accounts', label: 'Accounts', order: 40, load: () => import('./AccountSettings.svelte') },
];

export function settingsSections(modules: ModuleInfo[] | undefined): SettingsTab[] {
  return [...core, ...activeModules(modules).flatMap((module) => module.tabs ?? [])].sort(
    (a, b) => a.order - b.order,
  );
}
