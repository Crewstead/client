import type { FolderEntry, MachineView, ProjectRules } from '@crewstead/core/protocol';
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

/** Projects on one computer, managed from here inside the folders its owner allowed there. */
export const computerProjects = {
  browse: (machineId: string, folderId: string, path: string) =>
    request<{ entries: FolderEntry[]; more: boolean }>(
      `/machines/${machineId}/folders/${folderId}?path=${encodeURIComponent(path)}`,
    ),
  add: (machineId: string, folderId: string, path: string) =>
    request(`/machines/${machineId}/projects`, {
      method: 'POST',
      body: JSON.stringify({ folderId, path }),
    }),
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
    patch: { enabled?: false; commands?: boolean; browser?: boolean },
  ) => request(`/machines/${machineId}/computer`, { method: 'PATCH', body: JSON.stringify(patch) }),
};
