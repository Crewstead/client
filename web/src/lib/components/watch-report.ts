import type { TimelineItem } from '@crewstead/core/protocol';

/** A watch's report to its chat (server watches.ts writes them), read back for a short line. */
export interface WatchReport {
  label: string;
  watchId: string;
  command: string;
  lines: string[];
  /** "… N more lines left out." */
  more: number;
  ended?: string;
}

const HEAD = /^Watch “(.+?)” \((w[0-9a-f]{6}), `([\s\S]*?)`\)/;
const END = /\n*The watch ended: ([\s\S]+?)\.?$/;
const MORE = /\n… (\d+) more lines left out\.$/;

/** The report a watch sent to this chat, or nothing for any other message. */
export function watchReport(item: TimelineItem): WatchReport | undefined {
  if (item.role !== 'user' || item.sentBy?.model !== 'Crewstead') return undefined;
  if (!item.sentBy.chatTitle.startsWith('watch “')) return undefined;
  const head = HEAD.exec(item.text);
  if (!head) return undefined;
  let rest = item.text.slice(head[0].length);
  let ended: string | undefined;
  const end = END.exec(rest);
  if (end) {
    ended = end[1]!;
    rest = rest.slice(0, end.index);
  }
  let more = 0;
  const dropped = MORE.exec(rest);
  if (dropped) {
    more = Number(dropped[1]);
    rest = rest.slice(0, dropped.index);
  }
  rest = rest.replace(/^ reported:\n\n/, '');
  return {
    label: head[1]!,
    watchId: head[2]!,
    command: head[3]!,
    lines: rest ? rest.split('\n') : [],
    more,
    ...(ended ? { ended } : {}),
  };
}

/** "12 lines", "ended: exited with code 0", or both. */
export function watchSummary(report: WatchReport) {
  const count = report.lines.length + report.more;
  const parts = [
    ...(count ? [`${count} ${count === 1 ? 'line' : 'lines'}`] : []),
    ...(report.ended ? [`ended: ${report.ended}`] : []),
  ];
  return parts.join(' · ') || 'no new output';
}
