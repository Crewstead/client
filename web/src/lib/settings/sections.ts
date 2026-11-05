import type { ModuleInfo } from '@crewstead/core/protocol';
import { canEmbed } from '#lib/desktop/browser-panel.ts';
import { activeModules } from '#lib/modules/registry.ts';
import type { SettingsGroup, SettingsTab } from '#lib/modules/types.ts';

// Core categories; running modules add their own tabs through their descriptors.
const core: SettingsTab[] = [
  {
    id: 'models',
    label: 'Models',
    group: 'tools',
    order: 10,
    load: () => import('./ModelsSettings.svelte'),
  },
  {
    id: 'chats',
    label: 'Chats',
    group: 'chats',
    order: 30,
    load: () => import('./ChatsSettings.svelte'),
  },
  {
    id: 'accounts',
    label: 'Accounts',
    group: 'people',
    order: 40,
    load: () => import('./AccountSettings.svelte'),
  },
];

// Only the hub's owner manages its accounts.
const owners: SettingsTab[] = [
  {
    id: 'hub-accounts',
    label: 'Hub accounts',
    group: 'people',
    order: 35,
    load: () => import('./HubAccounts.svelte'),
  },
];

// In the desktop app: its own browser's sites and importing sign-ins into it.
const desktop: SettingsTab[] = [
  {
    id: 'browser',
    label: 'Browser',
    group: 'tools',
    order: 20,
    load: () => import('./BrowserSettings.svelte'),
  },
];

/** The Settings list's groups, in order. */
export const settingsGroups: { id: SettingsGroup; label: string }[] = [
  { id: 'tools', label: 'Models & tools' },
  { id: 'chats', label: 'Chats' },
  { id: 'people', label: 'People & account' },
];
const groupRank = (group: SettingsGroup) => settingsGroups.findIndex((entry) => entry.id === group);

export function settingsSections(modules: ModuleInfo[] | undefined, owner = false): SettingsTab[] {
  return [
    ...core,
    ...(owner ? owners : []),
    ...(canEmbed() ? desktop : []),
    ...activeModules(modules).flatMap((module) => module.tabs ?? []),
  ].sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.order - b.order);
}
