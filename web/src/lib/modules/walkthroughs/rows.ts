import type { Place, WalkState } from './walk-state.svelte.ts';

export interface Token {
  content: string;
  color?: string;
}
/** One row of the code panel. Its key stays the same from step to step, so a move can tell what leaves, what changes and what is new. */
export interface Row {
  key: string;
  kind: 'ln' | 'ln new' | 'ln gone' | 'walk-bubble' | 'walk-lead-in';
  /** A line of code: its number and coloured parts. */
  number?: number;
  tokens?: Token[];
  /** A note or a lead: its prose. */
  text?: string;
}

/** What the code panel holds at a place: every line, and the lead and notes of the step. */
export function rowsAt(state: WalkState, { step, sub, file }: Place): Row[] {
  const order = state.code.order;
  const at = order.get(step.id) ?? -1;
  const out: Row[] = [];
  let number = 0;
  let led = file !== state.code.steps.get(step.id)?.file;
  (state.files[file] ?? []).forEach((piece, place) => {
    const from = order.get(piece.from) ?? Infinity;
    const to = piece.to ? (order.get(piece.to) ?? Infinity) : Infinity;
    if (from > at || to < at) return;
    const added = from === at;
    const gone = to === at;
    if (added && piece.group > sub) return;
    if (!led && (added || gone)) {
      out.push({ key: `lead:${step.id}`, kind: 'walk-lead-in', text: step.lead });
      led = true;
    }
    const lastText = piece.lines.findLastIndex((line) => line.trim());
    piece.lines.forEach((line, index) => {
      const text = line.trim() !== '';
      if (!gone) number++;
      out.push({
        key: `${file}:${place}:${index}`,
        kind: gone ? 'ln gone' : added && text ? 'ln new' : 'ln',
        number: gone ? undefined : number,
        tokens: piece.tokens?.[index]?.filter((token) => token.content !== '\n') ?? [
          { content: line },
        ],
      });
      if (added && piece.note && index === lastText)
        out.push({
          key: `note:${step.id}:${piece.note}`,
          kind: 'walk-bubble',
          text: step.notes?.[piece.note],
        });
    });
  });
  return out;
}
