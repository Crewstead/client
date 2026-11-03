import { getContext, setContext } from 'svelte';
import type { TerminalInfo, TerminalSize } from '@crewstead/core/protocol';
import { request } from '../api';

/** How often the list is refreshed while a chat is open (a watch may start or end meanwhile). */
const REFRESH_MS = 4_000;

/**
 * A chat's terminals: its background commands and the shells opened from it, which of them show in the
 * drawer under the chat, and the one in front.
 */
export class ChatTerminals {
  list = $state<TerminalInfo[]>([]);
  /** Why a new terminal cannot be opened here; '' when it can, undefined before the first answer. */
  unavailable = $state<string>();
  /** Terminals shown as tabs in the drawer, in the order opened. */
  shown = $state<string[]>([]);
  active = $state<string>();
  error = $state('');
  private timer?: ReturnType<typeof setInterval>;
  private sessionId = '';
  private projectId: string | undefined;

  /** Typing works where a terminal could be opened: terminals on at that computer, and it online. */
  get typing() {
    return this.unavailable === '';
  }

  /** Follows one chat's terminals until the returned stop; a new chat starts with none shown. */
  follow(sessionId: string, projectId: string | undefined) {
    this.sessionId = sessionId;
    this.projectId = projectId;
    this.list = [];
    this.shown = [];
    this.active = undefined;
    this.unavailable = undefined;
    this.error = '';
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
    return () => clearInterval(this.timer);
  }

  async refresh() {
    const asked = this.sessionId;
    try {
      const place = this.projectId ? `&projectId=${encodeURIComponent(this.projectId)}` : '';
      const answer = await request<{ terminals: TerminalInfo[]; unavailable?: string }>(
        `/terminals?sessionId=${this.sessionId}${place}`,
      );
      if (asked !== this.sessionId) return;
      this.list = answer.terminals;
      this.unavailable = this.projectId
        ? (answer.unavailable ?? '')
        : 'Terminals are for chats on a computer.';
    } catch {
      // The list stays as it was; the next refresh tries again.
    }
  }

  find(id: string) {
    return this.list.find((entry) => entry.id === id);
  }

  /** Brings a terminal up in the drawer. */
  show(id: string) {
    if (!this.shown.includes(id)) this.shown = [...this.shown, id];
    this.active = id;
  }

  /** Takes its tab away; the terminal keeps running. */
  hide(id: string) {
    this.shown = this.shown.filter((entry) => entry !== id);
    if (this.active === id) this.active = this.shown.at(-1);
  }

  async open(size: TerminalSize) {
    if (!this.projectId) return;
    this.error = '';
    try {
      const info = await request<TerminalInfo>('/terminals', {
        method: 'POST',
        body: JSON.stringify({ projectId: this.projectId, sessionId: this.sessionId, ...size }),
      });
      this.list = [info, ...this.list];
      this.show(info.id);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not open a terminal.';
    }
  }

  /** Ends a shell, or stops a background command. */
  async close(id: string) {
    try {
      await request(`/terminals/${id}`, { method: 'DELETE' });
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not close it.';
    }
    void this.refresh();
  }
}

const key = Symbol('terminals');
export const provideTerminals = (terminals: ChatTerminals) => setContext(key, terminals);
/** The chat's terminals, where the chat page provides them (absent elsewhere, e.g. in exports). */
export const useTerminals = () => getContext<ChatTerminals | undefined>(key);
