import type { ModuleInfo } from '@crewstead/core/protocol';
import { canEmbed } from '#lib/desktop/browser-panel.ts';
import { activeModules } from '#lib/modules/registry.ts';
import type { SettingsGroup, SettingsTab } from '#lib/modules/types.ts';

// Core sections; running modules add their own through their descriptors. The structure is
// docs/plan/29-settings-design.md in the server repository.
const core: SettingsTab[] = [
  {
    id: 'general',
    label: 'General',
    group: 'general',
    order: 10,
    load: () => import('./GeneralSettings.svelte'),
  },
  {
    id: 'models',
    label: 'Models',
    group: 'models',
    order: 10,
    load: () => import('./ModelsSettings.svelte'),
  },
  {
    id: 'tools',
    label: 'Built-in tools',
    group: 'tools',
    order: 10,
    load: () => import('./ToolsSettings.svelte'),
  },
  {
    id: 'archived',
    label: 'Archived chats',
    group: 'chats',
    order: 20,
    load: () => import('./ArchivedSettings.svelte'),
  },
  {
    id: 'accounts',
    label: 'Your account',
    group: 'account',
    order: 10,
    load: () => import('./AccountSettings.svelte'),
  },
];

// Only the hub's owner manages who can sign in to it.
const owners: SettingsTab[] = [
  {
    id: 'hub-accounts',
    label: 'People on this hub',
    group: 'account',
    order: 30,
    load: () => import('./HubAccounts.svelte'),
  },
];

// In the desktop app: its own browser's sites and importing sign-ins into it.
const desktop: SettingsTab[] = [
  {
    id: 'browser',
    label: 'App browser',
    group: 'tools',
    order: 40,
    load: () => import('./BrowserSettings.svelte'),
  },
];

/** The Settings list's groups, in order. */
export const settingsGroups: { id: SettingsGroup; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'models', label: 'Models' },
  { id: 'tools', label: 'Tools' },
  { id: 'computers', label: 'Computers' },
  { id: 'chats', label: 'Chats' },
  { id: 'account', label: 'Account' },
  { id: 'developer', label: 'Developer' },
];
const groupRank = (group: SettingsGroup) => settingsGroups.findIndex((entry) => entry.id === group);

/** Sections that moved, so older links still open the right one. */
export const movedSections: Record<string, string> = { chats: 'general' };

export function settingsSections(modules: ModuleInfo[] | undefined, owner = false): SettingsTab[] {
  return [
    ...core,
    ...(owner ? owners : []),
    ...(canEmbed() ? desktop : []),
    ...activeModules(modules).flatMap((module) => module.tabs ?? []),
  ].sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.order - b.order);
}
