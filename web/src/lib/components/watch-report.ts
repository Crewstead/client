import type { TimelineItem } from '@crewstead/core/protocol';

/** A watch's note to its chat (server watches.ts writes them), read back for a short line. */
export interface WatchReport {
  label: string;
  watchId: string;
  command: string;
  /** Lines it brought: those matching the watch's pattern (all output, in older chats). */
  lines: string[];
  /** "… N more (matching) lines left out." */
  more: number;
  ended?: string;
  /** All the lines it wrote, given with its end; read with watch_read. */
  total?: number;
  /** A note for matching lines, before the end. */
  matched?: boolean;
}

const HEAD = /^Watch “(.+?)” \((w[0-9a-f]{6}), `([\s\S]*?)`\)/;
const ENDED =
  /^ ended: ([\s\S]+?)\. (\d+) lines? of output; read them with watch_read only if you need them\.(?:\n\nMatching lines:\n\n([\s\S]*))?$/;
const MORE = /\n… (\d+) more (?:matching )?lines left out\.$/;
// Before 2026-11-15 a watch sent its output, then its end.
const OLD_END = /\n*The watch ended: ([\s\S]+?)\.?$/;

/** Lines, less the "… N more lines left out." under them. */
function linesOf(text: string) {
  const dropped = MORE.exec(text);
  const body = dropped ? text.slice(0, dropped.index) : text;
  return { lines: body ? body.split('\n') : [], more: dropped ? Number(dropped[1]) : 0 };
}

/** The note a watch sent to this chat, or nothing for any other message. */
export function watchReport(item: TimelineItem): WatchReport | undefined {
  if (item.role !== 'user' || item.sentBy?.model !== 'Crewstead') return undefined;
  if (!item.sentBy.chatTitle.startsWith('watch “')) return undefined;
  const head = HEAD.exec(item.text);
  if (!head) return undefined;
  const watch = { label: head[1]!, watchId: head[2]!, command: head[3]! };
  let rest = item.text.slice(head[0].length);
  const ended = ENDED.exec(rest);
  if (ended)
    return {
      ...watch,
      ...linesOf(ended[3] ?? ''),
      ended: ended[1]!,
      total: Number(ended[2]),
    };
  if (rest.startsWith(' matched:\n\n'))
    return { ...watch, ...linesOf(rest.slice(11)), matched: true };
  const old = OLD_END.exec(rest);
  if (old) rest = rest.slice(0, old.index);
  return {
    ...watch,
    ...linesOf(rest.replace(/^ reported:\n\n/, '')),
    ...(old ? { ended: old[1]! } : {}),
  };
}

/** "2 matching lines", "ended: exited with code 0 · 120 lines", and the like. */
export function watchSummary(report: WatchReport) {
  const lines = (n: number, kind = '') => `${n} ${kind}${n === 1 ? 'line' : 'lines'}`;
  if (report.total !== undefined) return `ended: ${report.ended} · ${lines(report.total)}`;
  const count = report.lines.length + report.more;
  const parts = [
    ...(count ? [lines(count, report.matched ? 'matching ' : '')] : []),
    ...(report.ended ? [`ended: ${report.ended}`] : []),
  ];
  return parts.join(' · ') || 'no new output';
}
