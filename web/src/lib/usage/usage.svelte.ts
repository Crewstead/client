import type { ContextId, UsageReport } from '@crewstead/core/protocol';
import { request } from '#lib/api.ts';

export const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'Year' },
  { days: 0, label: 'All time' },
] as const;

/** The usage page's report for a workspace and period, in this browser's time zone. */
export class Usage {
  report = $state<UsageReport>();
  loading = $state(false);
  error = $state('');
  private asked = 0;

  async load(context: ContextId, days: number) {
    const ask = ++this.asked;
    this.loading = true;
    this.error = '';
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    try {
      const report = await request<UsageReport>(
        `/usage?context=${encodeURIComponent(context)}&days=${days}&tz=${encodeURIComponent(tz)}`,
      );
      if (ask === this.asked) this.report = report;
    } catch (cause) {
      if (ask === this.asked)
        this.error = cause instanceof Error ? cause.message : 'Could not load usage.';
    } finally {
      if (ask === this.asked) this.loading = false;
    }
  }
}

/** Up to `count` series keep their own colour; the rest are summed as "Other". */
export function topSeries(ids: string[], count = 5) {
  return { shown: ids.slice(0, count), other: ids.length > count };
}

export const usd = (value: number) =>
  value === 0 ? '$0' : value < 0.01 ? '<$0.01' : `$${value.toFixed(value < 100 ? 2 : 0)}`;

/** "Mon 3 Nov" in the viewer's language, from a calendar day. */
export const dayLabel = (day: string, style: 'short' | 'long' = 'short') =>
  day
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'short',
        ...(style === 'long' ? { weekday: 'short' } : {}),
      }).format(Date.parse(`${day}T12:00:00Z`))
    : '';
