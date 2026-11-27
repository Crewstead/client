import {
  parseWalkCode,
  type WalkCode,
  type WalkPiece,
  type WalkStep,
  type WalkthroughArguments,
} from '@crewstead/core/protocol';
import { highlight, type CodeLine } from '#lib/markdown/highlight.ts';

/** A place in a walkthrough: a step, how many of its groups are open, and the file on show. */
export interface Place {
  step: WalkStep;
  sub: number;
  file: string;
}
export type Painted = WalkPiece & { tokens?: CodeLine[] };
export const isCode = (step: WalkStep) => Boolean(step.notes);

/** Where the reader is in one walkthrough, and what they said they already know. */
export class WalkState {
  readonly walk: WalkthroughArguments['walk'];
  readonly code: WalkCode;
  readonly files: Record<string, Painted[]>;
  known = $state<string[]>([]);
  i = $state(0);
  sub = $state(0);
  file = $state('');
  /** Steps on show: a slide the reader ticked as known is left out. */
  list = $derived.by(() =>
    this.walk.steps.filter(
      (step) => typeof step.concept !== 'string' || !this.known.includes(step.concept),
    ),
  );
  step = $derived.by(() => this.list[Math.min(this.i, this.list.length - 1)]!);
  atStart = $derived.by(() => this.i === 0 && this.sub === 0);
  atEnd = $derived.by(
    () => this.i === this.list.length - 1 && this.sub === this.groups(this.step) - 1,
  );

  constructor(
    data: WalkthroughArguments,
    private store: string,
  ) {
    this.walk = data.walk;
    this.code = parseWalkCode(data.code, data.walk.steps);
    this.files = this.code.files;
    this.file = Object.keys(this.files)[0] ?? '';
    try {
      const saved = JSON.parse(localStorage.getItem(store) ?? 'null');
      if (!saved) return;
      this.known = saved.known ?? [];
      const index = this.list.findIndex((step) => step.id === saved.id);
      if (index >= 0) this.go(index, Math.min(saved.sub ?? 0, this.groups(this.list[index]!) - 1));
    } catch {
      // Starts from the beginning.
    }
  }

  groups(step: WalkStep) {
    return this.code.steps.get(step.id)?.groups ?? 1;
  }
  get place(): Place {
    return { step: this.step, sub: this.sub, file: this.file };
  }
  go(index: number, sub = 0) {
    this.i = index;
    this.sub = sub;
    this.file = this.code.steps.get(this.step.id)?.file ?? this.file;
    this.save();
  }
  next() {
    if (this.sub < this.groups(this.step) - 1) this.go(this.i, this.sub + 1);
    else if (this.i < this.list.length - 1) this.go(this.i + 1);
  }
  back() {
    if (this.sub > 0) this.go(this.i, this.sub - 1);
    else if (this.i > 0) this.go(this.i - 1, this.groups(this.list[this.i - 1]!) - 1);
  }
  /** The reader says they know (or do not know) what a slide explains; they stay where they are. */
  know(key: string, yes: boolean) {
    const here = this.step.id;
    this.known = yes ? [...this.known, key] : this.known.filter((one) => one !== key);
    this.i = Math.max(
      0,
      this.list.findIndex((step) => step.id === here),
    );
    this.save();
  }
  /** Colours every piece of code. Until it is done the code shows plain. */
  async paint() {
    for (const [name, pieces] of Object.entries(this.files)) {
      const language = name.split('.').at(-1) ?? '';
      for (const piece of pieces) piece.tokens = await highlight(piece.lines.join('\n'), language);
    }
  }
  private save() {
    try {
      const at = { known: this.known, id: this.step.id, sub: this.sub };
      localStorage.setItem(this.store, JSON.stringify(at));
    } catch {
      // The viewer works without it.
    }
  }
}
