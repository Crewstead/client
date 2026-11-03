import { PLAN_TOOL, planSteps, type PlanStep, type TimelineItem } from '@crewstead/core/protocol';
import { kindOf } from './tool-kinds.ts';

export interface ChangedFile {
  path: string;
  added: number;
  removed: number;
}

/** What the timeline draws: single items, runs of reading folded together, and a turn's changes. */
export type TimelineEntry =
  | { kind: 'item'; item: TimelineItem }
  | { kind: 'explored'; id: string; items: TimelineItem[] }
  | { kind: 'changes'; id: string; files: ChangedFile[] }
  /** The model's step list as it last kept it in a finished turn. */
  | { kind: 'plan'; id: string; steps: PlanStep[] }
  /** How long a finished turn worked, or (`since`) the clock of the one still running. */
  | {
      kind: 'worked';
      id: string;
      ms?: number;
      since?: string;
      tokensPerSecond?: number;
      /** A finished turn: its last item and its answer's text, for copying, retrying and forking. */
      turn?: { lastId: string; answer: string };
    };

// Reads, and commands that only read (ls, grep…), fold together; they never ask for approval.
// A screenshot stays on its own line, so its picture shows.
const isRead = (item: TimelineItem) =>
  item.role === 'tool' &&
  (kindOf(item.toolName) === 'read' || !!item.readOnly) &&
  !item.approvalId &&
  !item.attachments?.length;
// A step that only called tools leaves an empty, finished reply; there is nothing to show for it.
const isEmpty = (item: TimelineItem) =>
  item.role === 'assistant' && item.status === 'completed' && !item.text && !item.reasoning;

function stats(diff: string) {
  const lines = diff.split('\n');
  return {
    added: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
    removed: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length,
  };
}

/** Files a turn changed, with line counts added up per file, in the order first changed. */
export function changedFiles(items: TimelineItem[]): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const item of items) {
    if (item.role !== 'tool' || item.status !== 'completed' || !item.diff) continue;
    // Skills are the account's settings, not files of the chat's place; their cards show the change.
    if (item.toolName?.startsWith('skill_')) continue;
    const path = /^\+\+\+ b\/(.+)$/m.exec(item.diff)?.[1];
    if (!path) continue;
    const { added, removed } = stats(item.diff);
    const file = files.find((entry) => entry.path === path);
    if (file) {
      file.added += added;
      file.removed += removed;
    } else files.push({ path, added, removed });
  }
  return files;
}

/** `running` is true while the last turn is still going; its changes show once it ends. */
export function timelineEntries(items: TimelineItem[], running: boolean): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let turn: TimelineItem[] = [];
  let plan: { id: string; steps: PlanStep[] } | undefined;
  const endTurn = (finished = true) => {
    const asked = turn[0];
    // The step list sits at the end of its turn, like the footer, however often it changed.
    // A running turn's list sits above the prompt box instead (livePlan).
    if (plan && finished) entries.push({ kind: 'plan', id: `plan-${plan.id}`, steps: plan.steps });
    plan = undefined;
    if (finished) {
      const files = changedFiles(turn);
      if (files.length) entries.push({ kind: 'changes', id: `changes-${asked!.id}`, files });
    }
    if (asked?.role === 'user')
      entries.push({
        kind: 'worked',
        id: `worked-${asked.id}`,
        ...(finished ? { ms: asked.workedMs } : { since: asked.createdAt }),
        ...(finished && asked.generated && asked.generated.ms >= 250
          ? { tokensPerSecond: Math.round((asked.generated.tokens * 1000) / asked.generated.ms) }
          : {}),
        ...(finished
          ? {
              turn: {
                lastId: turn.at(-1)!.id,
                answer: turn
                  .filter((item) => item.role === 'assistant' && item.text)
                  .map((item) => item.text)
                  .join('\n\n'),
              },
            }
          : {}),
      });
    turn = [];
  };
  for (const item of items) {
    // A notice (another model or place) closes the turn before it, so its divider comes after it.
    if (item.role === 'user' || item.role === 'notice') endTurn();
    turn.push(item);
    if (isEmpty(item)) continue;
    // Plan updates show only as the turn's step list; one the model got wrong shows as a call.
    if (item.toolName === PLAN_TOOL && item.status !== 'failed' && item.status !== 'rejected') {
      const steps = item.status === 'completed' ? planSteps(item.arguments) : undefined;
      if (steps) plan = { id: plan?.id ?? item.id, steps };
      continue;
    }
    const last = entries.at(-1);
    if (isRead(item)) {
      if (last?.kind === 'explored') last.items.push(item);
      else entries.push({ kind: 'explored', id: `explored-${item.id}`, items: [item] });
    } else entries.push({ kind: 'item', item });
  }
  endTurn(!running);
  return entries;
}

/** The running turn's latest step list, shown above the prompt box until the turn ends. */
export function livePlan(items: TimelineItem[], running: boolean): PlanStep[] | undefined {
  if (!running) return undefined;
  for (let at = items.length - 1; at >= 0; at--) {
    const item = items[at]!;
    if (item.role === 'user' || item.role === 'notice') return undefined;
    if (item.toolName === PLAN_TOOL && item.status === 'completed') {
      const steps = planSteps(item.arguments);
      if (steps) return steps;
    }
  }
  return undefined;
}
