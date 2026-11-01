import { describe, expect, it } from 'vitest';
import { addUsage, type Session } from '@crewstead/core/protocol';
import { chatStats, compact, percent } from '../../web/src/lib/components/chat-stats.ts';

describe('chat statistics', () => {
  it('adds requests to per-model totals by purpose', () => {
    let usage = addUsage(undefined, 'a', { input: 100, cached: 40, output: 10 }, 'reply');
    usage = addUsage(usage, 'a', { input: 50, cached: 0, output: 5 }, 'review');
    usage = addUsage(usage, 'b', { input: 7, cached: 0, output: 1 }, 'compact');
    expect(usage).toEqual({
      a: { requests: 1, reviews: 1, summaries: 0, input: 150, cached: 40, output: 15 },
      b: { requests: 0, reviews: 0, summaries: 1, input: 7, cached: 0, output: 1 },
    });
    const session = {
      items: [],
      usage,
    } as unknown as Session;
    const stats = chatStats(session);
    expect(stats.models.map((model) => model.id)).toEqual(['a', 'b']);
    expect(stats.total).toMatchObject({ input: 157, output: 16, requests: 1 });
  });

  it('writes numbers short', () => {
    expect([compact(950), compact(1_250), compact(48_400), compact(2_345_678)]).toEqual([
      '950',
      '1.3k',
      '48k',
      '2.35M',
    ]);
    expect([percent(0, 100), percent(1, 1000), percent(50, 100)]).toEqual(['0%', '<1%', '50%']);
  });
});
