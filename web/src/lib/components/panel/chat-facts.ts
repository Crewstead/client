import type { Attachment, Session, TimelineItem } from '@crewstead/core/protocol';

/** Every file in a chat, newest first: what the user attached and what tools took. */
export const chatFiles = (session: Session): Attachment[] =>
  session.items.flatMap((item) => item.attachments ?? []).reverse();

const argument = (item: TimelineItem, key: string) => {
  try {
    const value = JSON.parse(item.arguments ?? '{}')[key];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
};

/**
 * A chat's browser as its tool calls left it: the last address opened, unless it was closed since.
 * `prefix` picks the computer's browser ("browser") or the server's ("web"); each closes after a while
 * unused.
 */
export function browserState(session: Session, prefix: 'browser' | 'web') {
  const calls = session.items.filter(
    (item) => item.role === 'tool' && item.toolName?.startsWith(`${prefix}_`),
  );
  if (!calls.length) return undefined;
  const last = calls.at(-1)!;
  const opened = calls.findLast(
    (item) => item.toolName === `${prefix}_open` && item.status === 'completed',
  );
  const closed = last.toolName === `${prefix}_close` && last.status === 'completed';
  return {
    calls: calls.length,
    url: closed ? undefined : opened && argument(opened, 'url'),
    screenshots: calls.filter((item) => item.attachments?.length).length,
  };
}
