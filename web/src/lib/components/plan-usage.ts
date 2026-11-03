import type { Model, PlanLimits, PlanWindow } from '@crewstead/core/protocol';

/** How full a window looks: calm, getting close, or at the limit. */
export type Level = 'ok' | 'high' | 'full';

export interface ShownWindow {
  label: string;
  /** 0–100 as shown; 0 once it has reset since the provider said so. */
  used: number;
  level: Level;
  /** "Resets in 1 h 26 min", "Resets Fri 12:00", or "Reset since" once past. */
  resets: string;
  reset: boolean;
}

const level = (window: PlanWindow, used: number): Level =>
  window.reached || used >= 90 ? 'full' : used >= 75 ? 'high' : 'ok';

/** When a window resets, as people say it: soon in hours and minutes, later by day and time. */
export function resetsIn(at: Date, now: Date): string {
  const minutes = Math.ceil((at.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return 'Reset since';
  if (minutes < 60) return `Resets in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Resets in ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  const day = at.toLocaleDateString(undefined, { weekday: 'short' });
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `Resets ${day} ${time}`;
}

/** The windows to show, the short one first; one that reset since counts as empty again. */
export function shownWindows(limits: PlanLimits, now = new Date()): ShownWindow[] {
  const order = { session: 0, week: 1, other: 2 };
  return [...limits.windows]
    .sort((a, b) => order[a.kind] - order[b.kind])
    .map((window) => {
      const at = window.resetsAt ? new Date(window.resetsAt) : undefined;
      const reset = !!at && at <= now;
      const used = reset ? 0 : Math.round(window.usedPercent);
      return {
        label: window.label,
        used,
        level: reset ? 'ok' : level(window, used),
        resets: at ? resetsIn(at, now) : '',
        reset,
      };
    });
}

/** The window that matters most now: one at its limit, else the fullest. */
export function tightest(windows: ShownWindow[]) {
  return [...windows].sort(
    (a, b) => Number(b.level === 'full') - Number(a.level === 'full') || b.used - a.used,
  )[0];
}

/** "3 min ago", for when the figures were reported. */
export function ago(at: string, now = new Date()) {
  const minutes = Math.round((now.getTime() - new Date(at).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

/** Whose plan a model's limits are, as the card names it. */
export const planName = (provider: string) =>
  provider === 'claude-code' ? 'Claude' : provider === 'chatgpt' ? 'ChatGPT' : provider;

/** What the message box shows for a model: its plan's limits, when it has any. */
export const usageOf = (model: Model | undefined) =>
  model?.limits ? { usage: { limits: model.limits, plan: planName(model.provider) } } : {};
