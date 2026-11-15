import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '@crewstead/core/protocol';
import { watchReport, watchSummary } from '../../web/src/lib/components/watch-report.ts';

const message = (text: string, title = 'watch “ui dev”'): TimelineItem => ({
  id: 'm1',
  role: 'user',
  text,
  status: 'completed',
  createdAt: '2026-11-03T12:00:00Z',
  sentBy: { chatId: 'c1', chatTitle: title, model: 'Crewstead' },
});
const head = 'Watch “ui dev” (we81f47, `cd /home/fin/Projects/Eidolon/ui && npx vite --port 5173`)';

describe('watch reports in the chat', () => {
  it('reads an ending without output', () => {
    const report = watchReport(message(`${head}\n\nThe watch ended: stopped after 30 minutes.`));
    expect(report).toMatchObject({
      label: 'ui dev',
      watchId: 'we81f47',
      command: 'cd /home/fin/Projects/Eidolon/ui && npx vite --port 5173',
      lines: [],
      ended: 'stopped after 30 minutes',
    });
    expect(watchSummary(report!)).toBe('ended: stopped after 30 minutes');
  });

  it('reads lines, lines left out, and an ending', () => {
    const report = watchReport(
      message(
        `${head} reported:\n\nready in 300 ms\nerror: x\n… 5 more lines left out.\n\nThe watch ended: exited with code 1.`,
      ),
    );
    expect(report).toMatchObject({ lines: ['ready in 300 ms', 'error: x'], more: 5 });
    expect(watchSummary(report!)).toBe('7 lines · ended: exited with code 1');
  });

  it('reads the short note at its end, with any matching lines', () => {
    const plain = watchReport(
      message(
        `${head} ended: exited with code 0. 120 lines of output; read them with watch_read only if you need them.`,
      ),
    );
    expect(plain).toMatchObject({ lines: [], ended: 'exited with code 0', total: 120 });
    expect(watchSummary(plain!)).toBe('ended: exited with code 0 · 120 lines');
    const matching = watchReport(
      message(
        `${head} ended: exited with code 1. 1 line of output; read them with watch_read only if you need them.\n\nMatching lines:\n\nerror: x`,
      ),
    );
    expect(matching).toMatchObject({ lines: ['error: x'], ended: 'exited with code 1', total: 1 });
  });

  it('reads matching lines sent before the end', () => {
    const report = watchReport(
      message(`${head} matched:\n\nready in 300 ms\n… 3 more matching lines left out.`),
    );
    expect(report).toMatchObject({ lines: ['ready in 300 ms'], more: 3, matched: true });
    expect(watchSummary(report!)).toBe('4 matching lines');
  });

  it('leaves the owner’s messages and other chats’ messages alone', () => {
    expect(watchReport({ ...message(head), sentBy: undefined })).toBeUndefined();
    expect(watchReport(message(head, 'Research chat'))).toBeUndefined();
  });
});
