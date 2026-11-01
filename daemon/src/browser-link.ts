import type { BrowserPool } from '@crewstead/core/browser';
import type {
  LiveEvent,
  MachineActionResult,
  MachineCommand,
  ProjectAction,
} from '@crewstead/core/protocol';

type Post = (body: { watchId: string; events: LiveEvent[] }) => Promise<void>;
type BrowserAction = Extract<
  ProjectAction,
  { kind: 'browsers' | 'browsers_close' | 'browser_control' | 'browser_input' }
>;

export const isBrowserAction = (action: ProjectAction): action is BrowserAction =>
  action.kind === 'browsers' ||
  action.kind === 'browser_control' ||
  action.kind === 'browser_input';

/**
 * Watching this computer's browser sessions from the hub. Events go to the hub one request at a
 * time; while one is on its way only the newest frame is kept, so a slow link shows fewer frames
 * instead of falling behind. Page and cursor events always arrive, in order.
 */
export function browserLink(pool: BrowserPool | undefined, post: Post) {
  const watches = new Map<string, () => void>();

  function sender(watchId: string) {
    let queue: LiveEvent[] = [];
    let sending = false;
    const flush = async () => {
      if (sending || !queue.length) return;
      sending = true;
      const events = queue.splice(0, 20);
      await post({ watchId, events }).catch(() => {});
      sending = false;
      void flush();
    };
    return (event: LiveEvent) => {
      if (event.type === 'frame') queue = queue.filter((queued) => queued.type !== 'frame');
      queue.push(event);
      void flush();
      if (event.type === 'closed') watches.delete(watchId);
    };
  }

  return {
    /** Handles watch commands; returns false for any other command. */
    handle(command: MachineCommand) {
      if (command.type === 'browser_unwatch') {
        watches.get(command.watchId)?.();
        watches.delete(command.watchId);
      } else if (command.type === 'browser_watch') {
        const send = sender(command.watchId);
        if (!pool) send({ type: 'closed' });
        else
          pool.watch(command.key, send, command.tab).then(
            (stop) => watches.set(command.watchId, stop),
            () => send({ type: 'closed' }),
          );
      } else return false;
      return true;
    },
    /** Lists sessions, or steers one. */
    async answer(action: BrowserAction): Promise<Omit<MachineActionResult, 'requestId'>> {
      if (!pool) return action.kind === 'browsers' ? { sessions: [] } : {};
      if (action.kind === 'browsers') return { sessions: await pool.sessions() };
      if (action.kind === 'browsers_close') {
        await Promise.all(pool.browsers(action.chat).map((key) => pool.close(key)));
        return {};
      }
      if (!pool.has(action.key)) return { error: 'This browser is not open any more.' };
      if (action.kind === 'browser_input') await pool.input(action.key, action.input, action.tab);
      else await pool.control(action.key, action.action, action.tab);
      return {};
    },
    stop() {
      for (const stop of watches.values()) stop();
      watches.clear();
    },
  };
}
