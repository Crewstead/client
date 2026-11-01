import { expect, it } from 'vitest';
import { duration } from '../../web/src/lib/components/duration.ts';

it('shows working time like Claude and Codex', () => {
  expect([800, 8_000, 72_000, 3_780_000].map(duration)).toEqual(['0s', '8s', '1m 12s', '1h 3m']);
});
