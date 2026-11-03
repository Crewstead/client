import type { MachineView, ProjectRules } from '@crewstead/core/protocol';
import { request } from '#lib/api.ts';

/** Computers connected through the Crewstead app on them. The token is returned only once. */
export const machines = {
  list: () => request<MachineView[]>('/machines'),
  create: (name: string) =>
    request<{ machine: MachineView; token: string }>('/machines', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) => request(`/machines/${id}`, { method: 'DELETE' }),
};

/** Projects on one computer: added there, restricted or removed from here. */
export const computerProjects = {
  update: (machineId: string, projectId: string, patch: { rules?: Partial<ProjectRules> }) =>
    request(`/machines/${machineId}/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  remove: (machineId: string, projectId: string) =>
    request(`/machines/${machineId}/projects/${projectId}`, { method: 'DELETE' }),
  /** Narrows or turns off whole-computer chats; turning them on happens at the computer. */
  computer: (
    machineId: string,
    patch: { enabled?: false; commands?: boolean; browser?: boolean; terminals?: false },
  ) => request(`/machines/${machineId}/computer`, { method: 'PATCH', body: JSON.stringify(patch) }),
};

/** Claude Code accounts on one computer. Signing in happens in that computer's browser. */
export const claudeAccounts = {
  add: (machineId: string, name: string, mode: 'usual' | 'new') =>
    request(`/machines/${machineId}/claude-accounts`, {
      method: 'POST',
      body: JSON.stringify({ name, mode }),
    }),
  login: (machineId: string, account: string) =>
    request(`/machines/${machineId}/claude-accounts/${account}/login`, { method: 'POST' }),
  rename: (machineId: string, account: string, name: string) =>
    request(`/machines/${machineId}/claude-accounts/${account}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  remove: (machineId: string, account: string) =>
    request(`/machines/${machineId}/claude-accounts/${account}`, { method: 'DELETE' }),
};
