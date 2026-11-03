import { apiUrl, withAccount } from './auth/connection.ts';
import type {
  ContextId,
  Effort,
  ItemDelta,
  Session,
  StreamEvent,
  TimelineItem,
  ToolProgress,
} from '@crewstead/core/protocol';
import { getSession, request, scoped } from './api';
import { addUsage } from '@crewstead/core/protocol';
import { newId } from './ids.ts';

const RETRY_MAX_MS = 30_000;

/** The model, effort and project picked in the prompt box, sent when they change. */
type SendChoices = { effort?: Effort; modelId?: string; projectId?: string };

export class Conversation {
  session = $state<Session | null>(null);
  connected = $state(false);
  error = $state('');
  sending = $state(false);
  private source?: EventSource;
  private retry?: ReturnType<typeof setTimeout>;
  private retryMs = 1_000;
  private generation = 0;
  private cursor = 0;

  async open(id: string, context: ContextId) {
    this.close();
    const generation = this.generation;
    this.error = '';
    // The chat on screen stays until the next one has loaded, so switching does not blank the page;
    // the page treats it as read-only meanwhile (its id is not the one in the address).
    try {
      const snapshot = await getSession(id, context);
      if (generation !== this.generation) return;
      this.session = snapshot.session;
      this.cursor = snapshot.cursor;
      this.connect(id, context, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.session = null;
      this.error = error instanceof Error ? error.message : 'Could not load this chat';
    }
  }

  /**
   * Opens the live stream. The browser retries a dropped stream by itself and the server resumes
   * from the last update seen; when the browser gives up (e.g. the server answered with an error
   * while restarting), a fresh stream is started with growing delays, keeping the chat on screen.
   */
  private connect(id: string, context: ContextId, generation: number) {
    const source = new EventSource(withAccount(apiUrl(scoped(`/sessions/${id}/events`, context))), {
      withCredentials: true,
    });
    this.source = source;
    const current = () => generation === this.generation && this.source === source;
    source.onopen = () => {
      if (!current()) return;
      this.connected = true;
      this.retryMs = 1_000;
    };
    source.onerror = () => {
      if (!current()) return;
      this.connected = false;
      void request('/auth/session').catch(() => {});
      if (source.readyState !== EventSource.CLOSED) return;
      this.retry = setTimeout(() => {
        if (generation === this.generation) this.connect(id, context, generation);
      }, this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
    };
    source.addEventListener('deleted', () => {
      if (!current()) return;
      this.close();
      this.session = null;
      this.error = 'This chat was deleted.';
    });
    source.addEventListener('snapshot', (event) => {
      if (!current()) return;
      const snapshot = JSON.parse(event.data) as { session: Session; cursor: number };
      this.session = snapshot.session;
      this.cursor = snapshot.cursor;
    });
    // On a resumed stream: the reply still being written, with its text so far.
    source.addEventListener('live', (event) => {
      if (current() && this.session) this.upsert(JSON.parse(event.data) as TimelineItem);
    });
    source.addEventListener('delta', (event) => {
      if (!current() || !this.session) return;
      const delta = JSON.parse(event.data) as ItemDelta;
      const item = this.session.items.find((candidate) => candidate.id === delta.itemId);
      // A gap (missed fragment) is skipped; the next saved update carries the full text.
      if (!item) return;
      if (delta.field === 'reasoning') {
        if ((item.reasoning ?? '').length === delta.offset)
          item.reasoning = (item.reasoning ?? '') + delta.text;
      } else if (item.text.length === delta.offset) item.text += delta.text;
    });
    // A running command's output so far; the saved result replaces it when it ends.
    source.addEventListener('progress', (event) => {
      if (!current() || !this.session) return;
      const progress = JSON.parse(event.data) as ToolProgress;
      const item = this.session.items.find((candidate) => candidate.id === progress.itemId);
      if (item?.status === 'pending') item.progress = progress.output;
    });
    source.addEventListener('update', (event) => {
      if (!current() || !this.session) return;
      const update = JSON.parse(event.data) as StreamEvent;
      if (update.cursor <= this.cursor) return;
      this.cursor = update.cursor;
      if (update.event.type === 'session.status') this.session.status = update.event.status;
      else if (update.event.type === 'session.preferences') {
        this.session.pinned = update.event.pinned;
        this.session.archived = update.event.archived;
        if (update.event.title) this.session.title = update.event.title;
        if (update.event.named) this.session.named = true;
      } else if (update.event.type === 'session.model') this.session.modelId = update.event.modelId;
      else if (update.event.type === 'session.context') {
        this.session.contextUsed = update.event.tokens;
        this.session.contextParts = update.event.parts;
      } else if (update.event.type === 'session.usage')
        this.session.usage = addUsage(
          this.session.usage,
          this.session.modelId,
          update.event.usage,
          update.event.purpose,
        );
      else if (update.event.type === 'session.project') {
        if (update.event.projectId) {
          this.session.projectId = update.event.projectId;
          if (update.event.name) this.session.projectName = update.event.name;
        } else {
          delete this.session.projectId;
          delete this.session.projectName;
        }
      } else if (update.event.type === 'session.queue') this.session.queued = update.event.queued;
      else if (update.event.type === 'session.items') {
        this.session.items = update.event.items;
        this.session.branches = update.event.branches;
      } else this.upsert(update.event.item);
    });
  }

  private upsert(item: TimelineItem) {
    const items = this.session!.items;
    const index = items.findIndex((previous) => previous.id === item.id);
    if (index < 0) items.push(item);
    else items[index] = item;
  }

  async command(path: string, context: ContextId, body: unknown = {}, method = 'POST') {
    this.error = '';
    try {
      await request(scoped(path, context), {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Action failed';
    }
  }

  /** `projectId` switches the chat's project ('' leaves it); unchanged values are not sent. */
  send(text: string, context: ContextId, options: SendChoices & { attachments?: string[] } = {}) {
    const { attachments, ...choices } = options;
    return this.post('messages', context, {
      text,
      ...(attachments?.length ? { attachments } : {}),
      ...this.choices(choices),
    });
  }

  /** Sends a message once the running reply ends (at once when none runs). */
  queue(text: string, context: ContextId, options: SendChoices & { attachments?: string[] } = {}) {
    const { attachments, ...choices } = options;
    return this.post('queue', context, {
      text,
      ...(attachments?.length ? { attachments } : {}),
      ...this.choices(choices),
    });
  }

  /** Takes a waiting message out of the queue. */
  unqueue(id: string, context: ContextId) {
    return this.command(`/sessions/${this.session!.id}/queue/${id}`, context, undefined, 'DELETE');
  }

  /** Sends the next waiting message now. */
  sendQueued(context: ContextId) {
    return this.command(`/sessions/${this.session!.id}/queue/next`, context);
  }

  /** Sends a prompt (or the one an answer replied to) again as a new version: retried, or edited. */
  again(itemId: string, context: ContextId, options: SendChoices & { text?: string } = {}) {
    const { text, ...choices } = options;
    return this.post('again', context, {
      itemId,
      ...(text ? { text } : {}),
      ...this.choices(choices),
    });
  }

  /** Shows another version of the chat from a prompt on. */
  version(anchor: string, version: number, context: ContextId) {
    return this.command(`/sessions/${this.session!.id}/version`, context, { anchor, version });
  }

  /** A new chat with this one's messages through `itemId`'s turn; its id, or nothing on failure. */
  async fork(itemId: string, context: ContextId) {
    this.error = '';
    try {
      const chat = await request<Session>(scoped(`/sessions/${this.session!.id}/fork`, context), {
        method: 'POST',
        body: JSON.stringify({ itemId, requestId: newId() }),
      });
      return chat.id;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not fork the chat';
      return undefined;
    }
  }

  private choices({ effort, modelId, projectId }: SendChoices) {
    const session = this.session!;
    return {
      ...(effort ? { effort } : {}),
      ...(modelId && modelId !== session.modelId ? { modelId } : {}),
      ...(projectId !== undefined && projectId !== (session.projectId ?? '')
        ? { projectId: projectId || null }
        : {}),
    };
  }

  private async post(path: 'messages' | 'again' | 'queue', context: ContextId, body: object) {
    if (!this.session || this.sending || !this.connected) return false;
    const generation = this.generation;
    this.sending = true;
    this.error = '';
    try {
      await request(scoped(`/sessions/${this.session.id}/${path}`, context), {
        method: 'POST',
        body: JSON.stringify({ ...body, requestId: newId() }),
      });
      return generation === this.generation;
    } catch (error) {
      if (generation === this.generation)
        this.error = error instanceof Error ? error.message : 'Send failed';
      return false;
    } finally {
      if (generation === this.generation) this.sending = false;
    }
  }

  close() {
    this.generation++;
    clearTimeout(this.retry);
    this.source?.close();
    this.source = undefined;
    this.connected = false;
    this.sending = false;
    this.retryMs = 1_000;
  }
}
