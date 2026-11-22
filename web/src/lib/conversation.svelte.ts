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
import { getEarlier, getLatest, request, scoped } from './api';
import { addUsage } from '@crewstead/core/protocol';
import { newId } from './ids.ts';

const RETRY_MAX_MS = 30_000;
/** Messages a chat opens with; earlier ones load as the reader scrolls up. */
const LATEST = 200;

/** The model, effort and project picked in the prompt box, sent when they change. */
type SendChoices = { effort?: Effort; modelId?: string; projectId?: string };

export class Conversation {
  session = $state<Session | null>(null);
  /** How many messages came before the loaded ones; they load on scrolling up or for the panel. */
  earlier = $state(0);
  connected = $state(false);
  error = $state('');
  sending = $state(false);
  private source?: EventSource;
  private retry?: ReturnType<typeof setTimeout>;
  private retryMs = 1_000;
  private generation = 0;
  private cursor = 0;
  private context?: ContextId;
  private loading?: Promise<void>;

  async open(id: string, context: ContextId) {
    this.close();
    const generation = this.generation;
    this.error = '';
    // The chat on screen stays until the next one has loaded, so switching does not blank the page;
    // the page treats it as read-only meanwhile (its id is not the one in the address).
    try {
      const snapshot = await getLatest(id, context, LATEST);
      if (generation !== this.generation) return;
      this.session = snapshot.session;
      this.earlier = snapshot.earlier;
      this.cursor = snapshot.cursor;
      this.context = context;
      this.connect(id, context, generation, snapshot.cursor);
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
  private connect(id: string, context: ContextId, generation: number, after = 0) {
    // The stream starts after the chat just loaded rather than sending all of it again.
    const path =
      scoped(`/sessions/${id}/events`, context) +
      `&limit=${LATEST}` +
      (after ? `&after=${after}` : '');
    const source = new EventSource(withAccount(apiUrl(path)), { withCredentials: true });
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
        if (generation === this.generation) this.connect(id, context, generation, this.cursor);
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
      const snapshot = JSON.parse(event.data) as {
        session: Session;
        cursor: number;
        earlier?: number;
      };
      this.session = snapshot.session;
      this.earlier = snapshot.earlier ?? 0;
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
      if (item?.status !== 'pending') return;
      item.progress = progress.output;
      // A sudo question shows while it is open; a report without one closes it.
      if (progress.password) item.password = progress.password;
      else delete item.password;
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
      else if (update.event.type === 'session.approvals')
        this.session.approvalMode = update.event.mode;
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
        this.earlier = 0;
      } else this.upsert(update.event.item);
    });
  }

  private upsert(item: TimelineItem) {
    const items = this.session!.items;
    const index = items.findIndex((previous) => previous.id === item.id);
    // An earlier message not loaded yet: it loads as it is now when the reader gets to it.
    if (index < 0 && this.earlier && items[0] && item.createdAt < items[0].createdAt) return;
    if (index < 0) items.push(item);
    // A running tool's output so far comes apart from its saved updates and stays until it ends.
    else if (
      item.status === 'pending' &&
      !item.progress &&
      (items[index]!.progress || items[index]!.password)
    ) {
      const { progress, password } = items[index]!;
      items[index] = { ...item, progress, ...(password ? { password } : {}) };
    } else items[index] = item;
  }

  /** Loads up to `count` messages before the loaded ones, or all of them when absent. */
  async loadEarlier(count?: number): Promise<void> {
    while (this.loading) await this.loading;
    const session = this.session;
    const first = session?.items[0]?.id;
    if (!session || !first || !this.earlier || !this.context) return;
    const generation = this.generation;
    const loading = getEarlier(session.id, this.context, first, count)
      .then((page) => {
        if (generation !== this.generation || this.session !== session) return;
        if (!this.earlier || session.items[0]?.id !== first) return;
        session.items.unshift(...page.items);
        session.branches = { ...page.branches, ...session.branches };
        this.earlier = page.earlier;
      })
      .catch((error: unknown) => {
        if (generation === this.generation)
          this.error = error instanceof Error ? error.message : 'Could not load earlier messages';
      })
      .finally(() => {
        if (this.loading === loading) this.loading = undefined;
      });
    this.loading = loading;
    await loading;
  }

  async command(path: string, context: ContextId, body: unknown = {}, method = 'POST') {
    await this.accepted(path, context, body, method);
  }

  /** Sends a command; whether the hub accepted it (why not shows as the chat's error). */
  async accepted(path: string, context: ContextId, body: unknown = {}, method = 'POST') {
    this.error = '';
    try {
      await request(scoped(path, context), {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Action failed';
      return false;
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

  /** Queued messages go to the hub one after another, so two sent quickly both keep their place. */
  private queueing: Promise<unknown> = Promise.resolve();

  /**
   * Sends a message once the running reply ends (at once when none runs). It shows as waiting at once;
   * the hub's own list replaces it when that arrives, and a failed one is taken back out.
   */
  queue(text: string, context: ContextId, options: SendChoices & { attachments?: string[] } = {}) {
    const session = this.session;
    if (!session || !this.connected) return Promise.resolve(false);
    const { attachments, ...choices } = options;
    const id = newId();
    const generation = this.generation;
    const files = attachments?.length ? { attachments } : {};
    const body = JSON.stringify({ text, ...files, ...this.choices(choices), requestId: id });
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- only read once, for a timestamp
    const createdAt = new Date().toISOString();
    session.queued = [...(session.queued ?? []), { id, text, ...files, createdAt }];
    const drop = () => (session.queued = (session.queued ?? []).filter((entry) => entry.id !== id));
    const sent = this.queueing.then(async () => {
      try {
        const result = await request<{ queued?: boolean }>(
          scoped(`/sessions/${session.id}/queue`, context),
          { method: 'POST', body },
        );
        // Nothing ran and nothing waited: the hub sent it as a message instead.
        if (!result?.queued) drop();
        return true;
      } catch (error) {
        drop();
        if (generation === this.generation)
          this.error = error instanceof Error ? error.message : 'Send failed';
        return false;
      }
    });
    this.queueing = sent;
    return sent;
  }

  /**
   * Takes a waiting message out of the queue. Once the hub has it: one shown before the hub answered
   * would otherwise stay queued there and be sent after all.
   */
  async unqueue(id: string, context: ContextId) {
    await this.queueing;
    return this.command(`/sessions/${this.session!.id}/queue/${id}`, context, undefined, 'DELETE');
  }

  /** Sends the waiting messages now, or just `message`, stopping a running reply first. */
  async sendQueued(context: ContextId, message?: string) {
    await this.queueing;
    return this.command(
      `/sessions/${this.session!.id}/queue/next`,
      context,
      message ? { message } : {},
    );
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
    this.loading = undefined;
  }
}
