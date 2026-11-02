import { getContext } from 'svelte';
import type { ApprovalMode, ContextId, Session } from '@crewstead/core/protocol';
import { SvelteMap } from 'svelte/reactivity';
import { request, scoped, type Catalog } from './api';
import { newReply, notifier } from './notifications.svelte.ts';

/** A chat whose reply is still going (working, or waiting for the owner). */
export const busy = (status: Session['status']) =>
  status === 'running' || status === 'awaiting_approval';

const CONTEXT_KEY = 'crewstead-context';

export class Workspace {
  context = $state<ContextId>('personal');
  catalog = $state<Catalog | null>(null);
  sessions = $state<Omit<Session, 'items'>[]>([]);
  /** Chats whose reply finished (or failed) while the owner was in another chat. */
  unseen = new SvelteMap<string, 'done' | 'failed'>();
  /** The chat open now; its own endings are seen as they happen. */
  private open = '';
  error = $state('');
  ready = $state(false);
  private generation = 0;
  private disposed = false;
  constructor(private scope: string) {}
  draftKey(value: string) {
    return `crewstead:draft:${this.scope}:${value}`;
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.sessions = [];
    this.catalog = null;
    this.ready = false;
  }

  /** How tool calls are approved, in all chats of this account. */
  async setApprovalMode(mode: ApprovalMode) {
    const result = await request<{ approvalMode: ApprovalMode }>('/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ approvalMode: mode }),
    });
    if (this.catalog) this.catalog.preferences = result;
  }

  async setPreferences(
    id: string,
    patch: Partial<Pick<Session, 'pinned' | 'archived' | 'title' | 'modelId'>>,
  ) {
    const context = this.context;
    const updated = await request<Session>(scoped(`/sessions/${id}`, context), {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (context !== this.context) return;
    this.sessions = this.sessions.map((session) =>
      session.id === id
        ? {
            ...session,
            pinned: updated.pinned,
            archived: updated.archived,
            title: updated.title,
            modelId: updated.modelId,
          }
        : session,
    );
  }

  /** A chat open here got a new name (written by its model): the list shows it at once. */
  retitle(id: string, title: string) {
    if (this.sessions.some((session) => session.id === id && session.title !== title))
      this.sessions = this.sessions.map((session) =>
        session.id === id ? { ...session, title } : session,
      );
  }

  /** The open chat's status as it streams in, so its row shows it at once. */
  setStatus(id: string, status: Session['status']) {
    const before = this.sessions.find((session) => session.id === id);
    if (before && before.status !== status)
      notifier.changed({ ...before, status }, before, this.context, this.open);
    if (this.sessions.some((session) => session.id === id && session.status !== status))
      this.sessions = this.sessions.map((session) =>
        session.id === id ? { ...session, status } : session,
      );
  }

  /** Reloads only the chat list (cheap), noting replies that ended in chats not open now. */
  async refreshChats() {
    if (this.disposed) return;
    const context = this.context;
    const sessions = await request<Omit<Session, 'items'>[]>(scoped('/sessions', context)).catch(
      () => undefined,
    );
    if (!sessions || context !== this.context) return;
    this.noteEndings(sessions);
    this.sessions = sessions;
  }

  /** Replies that ended while their chat was not open: marked until it is opened, and notified. */
  private noteEndings(next: Omit<Session, 'items'>[]) {
    for (const session of next) {
      const before = this.sessions.find((entry) => entry.id === session.id);
      // A chat that appeared since the list was first read started idle (e.g. one a model made).
      const previous =
        before ??
        (this.sessions.length
          ? { ...session, status: 'idle' as const, updatedAt: session.createdAt }
          : undefined);
      const since = previous ? notifier.changed(session, previous, this.context, this.open) : 0;
      if (!before || !busy(before.status) || busy(session.status) || session.id === this.open)
        continue;
      if (session.status !== 'idle') {
        this.unseen.set(session.id, 'failed');
        continue;
      }
      // Marked only when there is a reply to read: a scheduled run with nothing new leaves none.
      const context = this.context;
      void newReply(session.id, context, since).then((reply) => {
        if (reply !== undefined && session.id !== this.open && context === this.context)
          this.unseen.set(session.id, 'done');
      });
    }
  }

  /** Opening a chat sees how its last reply ended. */
  seen(id: string) {
    this.open = id;
    this.unseen.delete(id);
  }

  async move(id: string, projectId: string | null) {
    const context = this.context;
    const moved = await request<Session>(scoped(`/sessions/${id}/move`, context), {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
    if (context !== this.context) return moved;
    this.sessions = this.sessions.map((session) => {
      if (session.id !== id) return session;
      const { projectId: _project, projectName: _name, ...rest } = session;
      return moved.projectId
        ? { ...rest, projectId: moved.projectId, projectName: moved.projectName ?? '' }
        : rest;
    });
    return moved;
  }

  /** Deletes one archived chat, or every archived chat when no id is given. */
  async deleteArchived(id?: string) {
    const context = this.context;
    await request(scoped(id ? `/sessions/${id}` : '/sessions/archived', context), {
      method: 'DELETE',
    });
    if (context === this.context)
      this.sessions = this.sessions.filter((session) =>
        id ? session.id !== id : !session.archived,
      );
  }

  async refresh() {
    if (this.disposed) return;
    const generation = ++this.generation;
    const context = this.context;
    try {
      const [catalog, sessions] = await Promise.all([
        request<Catalog>(scoped('/catalog', context)),
        request<Omit<Session, 'items'>[]>(scoped('/sessions', context)),
      ]);
      if (generation !== this.generation) return;
      this.catalog = catalog;
      this.noteEndings(sessions);
      this.sessions = sessions;
      this.error = '';
      this.ready = true;
    } catch (error) {
      if (generation !== this.generation) return;
      this.error = error instanceof Error ? error.message : 'Could not connect to the server';
    }
  }

  /** The active workspace entry (Personal or an organisation, with the caller's role). */
  get current() {
    return this.catalog?.contexts.find((context) => context.id === this.context);
  }

  async changeContext(context: ContextId) {
    this.generation++;
    this.context = context;
    this.sessions = [];
    this.catalog = null;
    this.ready = false;
    localStorage.setItem(CONTEXT_KEY, context);
    await this.refresh();
  }

  /** Restores the last workspace if the user still belongs to it; otherwise Personal. */
  async initialize() {
    const saved = localStorage.getItem(CONTEXT_KEY);
    if (saved?.startsWith('org:')) {
      try {
        // Shared workspaces come from modules; the catalog lists the ones this user still belongs to.
        const { contexts } = await request<Catalog>(scoped('/catalog', 'personal'));
        if (contexts.some((context) => context.id === saved)) this.context = saved;
        else localStorage.removeItem(CONTEXT_KEY);
      } catch {
        /* fall back to Personal */
      }
    }
    await this.refresh();
  }
}

export const useWorkspace = () => getContext<Workspace>('workspace');
