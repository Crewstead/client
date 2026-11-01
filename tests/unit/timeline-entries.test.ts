import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '@crewstead/core/protocol';
import { timelineEntries } from '../../web/src/lib/components/timeline-entries.ts';

const item = (role: TimelineItem['role'], fields: Partial<TimelineItem> = {}): TimelineItem => ({
  id: randomUUID(),
  role,
  text: '',
  status: 'completed',
  createdAt: '2026-10-30T00:00:00Z',
  ...fields,
});
const read = (path: string) => item('tool', { toolName: 'read_file', text: `Read ${path}` });
const edit = (path: string, diff: string) =>
  item('tool', { toolName: 'edit_file', diff: `--- a/${path}\n+++ b/${path}\n${diff}` });

describe('timeline entries', () => {
  it('folds reads in a row into one entry and hides empty steps between them', () => {
    const entries = timelineEntries(
      [
        item('user', { text: 'look around' }),
        item('assistant'),
        read('a.ts'),
        item('assistant'),
        read('b.ts'),
        item('assistant', { text: 'Found it.' }),
      ],
      false,
    );
    expect(entries.map((entry) => entry.kind)).toEqual(['item', 'explored', 'item', 'worked']);
    expect(entries[1]).toMatchObject({ kind: 'explored', items: [{}, {}] });
  });

  it('lists a finished turn’s changed files with their line counts, once it has ended', () => {
    const items = [
      item('user', { text: 'fix it' }),
      edit('a.ts', '@@ -1 +1 @@\n-x\n+y\n'),
      edit('a.ts', '@@ -2 +2,2 @@\n+z\n'),
      edit('b.ts', '@@ -1 +0 @@\n-gone\n'),
      item('assistant', { text: 'Done.' }),
    ];
    expect(timelineEntries(items, true).some((entry) => entry.kind === 'changes')).toBe(false);
    expect(timelineEntries(items, false).at(-2)).toEqual({
      kind: 'changes',
      id: `changes-${items[0]!.id}`,
      files: [
        { path: 'a.ts', added: 2, removed: 1 },
        { path: 'b.ts', added: 0, removed: 1 },
      ],
    });
  });

  it('ends a finished turn with its working time and answer, and a running one with a clock', () => {
    const asked = item('user', { text: 'go', workedMs: 72_000 });
    const reply = item('assistant', { text: 'Done.' });
    const steps = [asked, item('assistant', { text: 'Looking.' }), read('a.ts'), reply];
    expect(timelineEntries(steps, false).at(-1)).toEqual({
      kind: 'worked',
      id: `worked-${asked.id}`,
      ms: 72_000,
      // For copying the answer, and retrying or forking from the turn's end.
      turn: { lastId: reply.id, answer: 'Looking.\n\nDone.' },
    });
    const now = item('user', { text: 'again' });
    expect(timelineEntries([asked, now], true).at(-1)).toEqual({
      kind: 'worked',
      id: `worked-${now.id}`,
      since: now.createdAt,
    });
  });
});
