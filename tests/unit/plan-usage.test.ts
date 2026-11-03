import { describe, expect, it } from 'vitest';
import { resetsIn, shownWindows, tightest } from '../../web/src/lib/components/plan-usage.ts';

const now = new Date('2026-11-04T10:00:00Z');
const limits = {
  checkedAt: '2026-11-04T09:55:00Z',
  windows: [
    { kind: 'week' as const, label: 'Weekly', usedPercent: 81.4, resetsAt: '2026-11-07T12:00:00Z' },
    {
      kind: 'session' as const,
      label: '5-hour',
      usedPercent: 40,
      resetsAt: '2026-11-04T11:26:00Z',
    },
  ],
};

describe('plan usage as shown', () => {
  it('lists the short window first, with how full each is and when it resets', () => {
    const windows = shownWindows(limits, now);
    expect(windows.map((window) => [window.label, window.used, window.level])).toEqual([
      ['5-hour', 40, 'ok'],
      ['Weekly', 81, 'high'],
    ]);
    expect(windows[0]!.resets).toBe('Resets in 1 h 26 min');
    expect(tightest(windows)!.label).toBe('Weekly');
  });

  it('counts a window that reset since as empty, and one at its limit first', () => {
    const later = new Date('2026-11-04T12:00:00Z');
    const windows = shownWindows(
      {
        ...limits,
        windows: [
          { ...limits.windows[1]!, usedPercent: 100, reached: true },
          { ...limits.windows[0]!, usedPercent: 95, reached: true },
        ],
      },
      later,
    );
    expect(windows[0]).toMatchObject({ used: 0, level: 'ok', resets: 'Reset since', reset: true });
    expect(tightest(windows)).toMatchObject({ label: 'Weekly', level: 'full' });
    expect(resetsIn(new Date('2026-11-04T10:30:00Z'), now)).toBe('Resets in 30 min');
  });
});
