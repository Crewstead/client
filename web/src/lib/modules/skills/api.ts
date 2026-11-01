import type { Skill, SkillScope, SkillsView } from '@crewstead/core/protocol';
import { request } from '#lib/api.ts';

export interface SkillFields {
  name: string;
  description: string;
  instructions: string;
  enabled?: boolean;
  always?: boolean;
}

/** Global and personal skills, and the skills kept on in each chat. */
export const skills = {
  list: () => request<SkillsView>('/skills'),
  create: (scope: SkillScope, fields: SkillFields) =>
    request<Skill>('/skills', { method: 'POST', body: JSON.stringify({ scope, ...fields }) }),
  update: (id: string, patch: Partial<SkillFields>) =>
    request<Skill>(`/skills/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) => request(`/skills/${id}`, { method: 'DELETE' }),
  forChat: (sessionId: string) => request<{ names: string[] }>(`/skills/chats/${sessionId}`),
  setForChat: (sessionId: string, names: string[]) =>
    request<{ names: string[] }>(`/skills/chats/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify({ names }),
    }),
};

/** Skills a chat can use: enabled ones, a personal skill replacing a global one of its name. */
export function usableSkills(list: Skill[]) {
  const byName = new Map<string, Skill>();
  for (const skill of list)
    if (skill.enabled && (skill.scope === 'personal' || !byName.has(skill.name)))
      byName.set(skill.name, skill);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
