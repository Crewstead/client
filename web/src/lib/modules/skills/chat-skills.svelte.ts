import type { Skill } from '@crewstead/core/protocol';
import { skills, usableSkills } from './api.ts';

/**
 * The account's usable skills and the ones kept on in each chat, shared by the prompt box picker and
 * the side panel so a change in one shows in the other.
 */
class ChatSkillsState {
  available = $state<Skill[]>([]);
  chosen = $state<Record<string, string[]>>({});
  error = $state('');

  async load(sessionId: string) {
    try {
      const [view, chat] = await Promise.all([skills.list(), skills.forChat(sessionId)]);
      this.available = usableSkills(view.skills);
      this.chosen[sessionId] = chat.names;
    } catch {
      this.available = [];
    }
  }

  async toggle(sessionId: string, name: string, on: boolean) {
    const before = this.chosen[sessionId] ?? [];
    const next = on ? [...before, name] : before.filter((entry) => entry !== name);
    this.chosen[sessionId] = next;
    this.error = '';
    try {
      this.chosen[sessionId] = (await skills.setForChat(sessionId, next)).names;
    } catch (cause) {
      this.chosen[sessionId] = before;
      this.error = cause instanceof Error ? cause.message : 'Could not change the chat’s skills.';
    }
  }
}

export const chatSkills = new ChatSkillsState();
