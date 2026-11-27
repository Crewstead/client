import type { WalkDiagramRow, WalkStep, Walkthrough } from '@crewstead/core/protocol';

/** The diagram beside a code step: which rows the step writes now and which were written before. */
export interface Live {
  /** Two steps with the same key show the same diagram; only the highlight moves between them. */
  key: string;
  title: string;
  plain?: boolean;
  rows: WalkDiagramRow[];
  now: number[];
  done: number[];
}

export function liveOf(walk: Walkthrough, step: WalkStep): Live | undefined {
  const live = walk.live?.[step.id];
  const diagram = live && walk.diagrams?.[live[0]];
  if (!live || !diagram) return undefined;
  const [name, now, say = {}] = live;
  const done = new Set(diagram.done ?? []);
  for (const earlier of walk.steps) {
    if (earlier.id === step.id) break;
    const before = walk.live?.[earlier.id];
    if (before?.[0] === name) for (const row of before[1]) done.add(row);
  }
  return {
    key: name + JSON.stringify(say),
    title: diagram.title,
    plain: diagram.plain,
    rows: diagram.rows.map((row, index) => (say[index] ? { ...row, say: say[index] } : row)),
    now,
    done: [...done].filter((row) => !now.includes(row)),
  };
}
