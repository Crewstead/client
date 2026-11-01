import type { ModuleInfo } from '@crewstead/core/protocol';
import { connectionsClient } from './connections/module.ts';
import { machinesClient } from './machines/module.ts';
import { mockProviderClient } from './mock-provider/module.ts';
import { organisationsClient } from './organisations/module.ts';
import { skillsClient } from './skills/module.ts';
import { cloudSandboxClient } from './cloud-sandbox/module.ts';
import { webSearchClient } from './web-search/module.ts';
import { serverBrowserClient } from './server-browser/module.ts';
import { scheduledTasksClient } from './scheduled-tasks/module.ts';
import type { ClientModule, ConnectOption, Mention, SlotName } from './types.ts';

/** Composition root for client modules. Removing one means deleting its folder and its line here. */
const clientModules: ClientModule[] = [
  organisationsClient,
  connectionsClient,
  machinesClient,
  mockProviderClient,
  skillsClient,
  serverBrowserClient,
  cloudSandboxClient,
  webSearchClient,
  scheduledTasksClient,
];

/**
 * Modules the hub runs. A module turned off for the whole hub has a reason and is hidden; one the user
 * switched off for their account (the mock provider) stays visible so it can be switched back on.
 */
export function activeModules(modules: ModuleInfo[] | undefined): ClientModule[] {
  const running = new Set(
    (modules ?? []).filter((module) => !module.reason).map((module) => module.id),
  );
  return clientModules.filter((module) => running.has(module.id));
}

export const connectOptionsFor = (modules: ClientModule[]): ConnectOption[] =>
  modules.flatMap((module) => module.connectOptions ?? []);

export function panelsFor(modules: ClientModule[], slot: SlotName) {
  return modules
    .flatMap((module) => module.panels ?? [])
    .filter((panel) => panel.slot === slot)
    .sort((a, b) => a.order - b.order);
}

/** Everything running modules offer to mention with "@"; a module that fails to answer offers none. */
export async function mentionsFor(modules: ClientModule[]): Promise<Mention[]> {
  const lists = await Promise.all(
    modules.map((module) => module.mentions?.().catch(() => []) ?? Promise.resolve([])),
  );
  return lists.flat();
}
