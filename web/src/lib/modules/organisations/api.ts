import type { Member, Organisation, Role } from '@crewstead/core/protocol';
import { request } from '#lib/api.ts';

const send = (method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/** Organisation administration. Authorization is enforced by the hub, not by hiding buttons. */
export const organisations = {
  list: () => request<Organisation[]>('/orgs'),
  create: (name: string) => request<Organisation>('/orgs', send('POST', { name })),
  update: (id: string, patch: { name?: string; allowPersonal?: boolean; shareModels?: boolean }) =>
    request<Organisation>(`/orgs/${id}`, send('PATCH', patch)),
  members: (id: string) => request<Member[]>(`/orgs/${id}/members`),
  addMember: (id: string, login: string, role: Role) =>
    request<Member[]>(`/orgs/${id}/members`, send('POST', { login, role })),
  changeRole: (id: string, userId: string, role: Role) =>
    request<Member[]>(`/orgs/${id}/members/${userId}`, send('PATCH', { role })),
  remove: (id: string, userId: string) => request(`/orgs/${id}/members/${userId}`, send('DELETE')),
};
