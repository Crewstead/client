const key = 'crewstead-chat-panel';

/**
 * Whether a chat's details panel is open. The choice is remembered on this device; until one is made,
 * it opens on wide screens, where it fits beside the conversation.
 */
class ChatPanelSetting {
  open = $state(false);

  load() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(key);
    } catch {
      // Without storage the default applies.
    }
    this.open = saved === null ? window.matchMedia('(min-width: 1101px)').matches : saved === '1';
  }

  set(open: boolean) {
    this.open = open;
    try {
      localStorage.setItem(key, open ? '1' : '0');
    } catch {
      // Remembered for this page only.
    }
  }
}

export const chatPanel = new ChatPanelSetting();
