import type { ModelUsage, Session } from '@crewstead/core/protocol';
import { kindOf } from './tool-kinds.ts';
import { changedFiles } from './timeline-entries.ts';

export interface ChatStats {
  messages: number;
  replies: number;
  tools: { total: number; reads: number; changes: number; commands: number; declined: number };
  approvals: { asked: number; automatic: number; reviewed: number };
  files: { count: number; added: number; removed: number };
  models: Array<{ id: string } & ModelUsage>;
  total: ModelUsage;
}

const empty = (): ModelUsage => ({
  requests: 0,
  reviews: 0,
  summaries: 0,
  input: 0,
  cached: 0,
  output: 0,
});

/** Counts for the statistics panel, all from the chat as saved. */
export function chatStats(session: Session): ChatStats {
  const tools = session.items.filter((item) => item.role === 'tool');
  const files = changedFiles(session.items);
  const models = Object.entries(session.usage ?? {})
    .map(([id, usage]) => ({ id, ...usage }))
    .sort((a, b) => b.input + b.output - (a.input + a.output));
  const total = models.reduce((sum, model) => {
    for (const key of Object.keys(sum) as Array<keyof ModelUsage>) sum[key] += model[key];
    return sum;
  }, empty());
  return {
    messages: session.items.filter((item) => item.role === 'user').length,
    replies: session.items.filter((item) => item.role === 'assistant' && item.text).length,
    tools: {
      total: tools.length,
      reads: tools.filter((item) => kindOf(item.toolName) === 'read').length,
      changes: tools.filter((item) => ['change', 'note'].includes(kindOf(item.toolName))).length,
      commands: tools.filter((item) => kindOf(item.toolName) === 'command').length,
      declined: tools.filter((item) => item.status === 'rejected').length,
    },
    approvals: {
      asked: tools.filter((item) => item.approvalId).length,
      automatic: tools.filter((item) => item.autoApproved).length,
      reviewed: tools.filter((item) => item.review && item.review.outcome !== 'checking').length,
    },
    files: {
      count: files.length,
      added: files.reduce((sum, file) => sum + file.added, 0),
      removed: files.reduce((sum, file) => sum + file.removed, 0),
    },
    models,
    total,
  };
}

/** 1234 → "1.2k", 1234567 → "1.23M". */
export function compact(n: number) {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

/** "1 read", "2 reads". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A share as a whole percent, with "<1%" for anything small but not nothing. */
export const percent = (part: number, whole: number) => {
  const value = Math.round((part / whole) * 100);
  return value || !part ? `${value}%` : '<1%';
};
