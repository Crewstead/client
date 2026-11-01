import type { ClientModule } from '../types.ts';
import { skills, usableSkills } from './api.ts';

export const skillsClient: ClientModule = {
  id: 'skills',
  tabs: [
    { id: 'skills', label: 'Skills', order: 18, load: () => import('./SkillsSettings.svelte') },
  ],
  panels: [{ slot: 'chat-panel', order: 10, load: () => import('./PanelSkills.svelte') }],
  mentions: async () =>
    usableSkills((await skills.list()).skills).map((skill) => ({
      name: skill.name,
      hint: skill.description,
    })),
};
