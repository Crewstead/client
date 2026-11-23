import type { ClientModule } from '../types.ts';
import { skills, usableSkills } from './api.ts';

export const skillsClient: ClientModule = {
  id: 'skills',
  tabs: [
    {
      id: 'skills',
      label: 'Skills',
      group: 'tools',
      order: 20,
      load: () => import('./SkillsSettings.svelte'),
    },
  ],
  panels: [{ slot: 'chat-header', order: 10, load: () => import('./HeaderSkills.svelte') }],
  mentions: async () =>
    usableSkills((await skills.list()).skills).map((skill) => ({
      name: skill.name,
      hint: skill.description,
    })),
};
