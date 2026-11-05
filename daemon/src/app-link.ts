/**
 * Requests between the desktop app and the computer service it runs, over the service's IPC channel
 * (Node's process messages). Either side asks; the other answers with a value or an error message.
 * Values are plain JSON: binary data travels as base64.
 */
type Message =
  { ask: number; op: string; args: unknown } | { answer: number; value?: unknown; error?: string };

export type Handler = (op: string, args: unknown) => unknown;

export interface AppLink {
  /** Feeds a message from the other side. */
  receive(message: unknown): void;
  ask(op: string, args?: unknown, timeoutMs?: number): Promise<unknown>;
  /** The other side went away: what is waiting fails. */
  drop(): void;
}

export function appLink(send: (message: Message) => void, handle: Handler): AppLink {
  const waiting = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (e: Error) => void }
  >();
  let next = 0;
  return {
    receive(message) {
      if (!message || typeof message !== 'object') return;
      if ('ask' in message && typeof message.ask === 'number' && 'op' in message) {
        const { ask, op, args } = message as Extract<Message, { ask: number }>;
        void Promise.resolve()
          .then(() => handle(String(op), args))
          .then(
            (value) => send({ answer: ask, value }),
            (error: unknown) =>
              send({ answer: ask, error: error instanceof Error ? error.message : String(error) }),
          );
      } else if ('answer' in message && typeof message.answer === 'number') {
        const { answer, value, error } = message as Extract<Message, { answer: number }>;
        const pending = waiting.get(answer);
        waiting.delete(answer);
        if (error === undefined) pending?.resolve(value);
        else pending?.reject(new Error(error));
      }
    },
    ask(op, args, timeoutMs = 15_000) {
      const id = ++next;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(new Error('No answer came from the other side.'));
        }, timeoutMs);
        const settle =
          <T>(done: (value: T) => void) =>
          (value: T) => {
            clearTimeout(timer);
            done(value);
          };
        waiting.set(id, { resolve: settle(resolve), reject: settle(reject) });
        send({ ask: id, op, args });
      });
    },
    drop() {
      for (const pending of waiting.values())
        pending.reject(new Error('The other side went away.'));
      waiting.clear();
    },
  };
}
