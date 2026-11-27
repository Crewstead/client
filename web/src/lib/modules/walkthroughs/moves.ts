import { proseInto } from './rich.ts';
import type { Row } from './rows.ts';

export const OUT = 240;
const IN = 280;
const EACH = 35;
export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const SIZES = [
  'height',
  'minHeight',
  'marginTop',
  'marginBottom',
  'paddingTop',
  'paddingBottom',
  'borderTopWidth',
  'borderBottomWidth',
] as const;
/** Opens a row from nothing or closes it to nothing, so the rows around it slide instead of jumping. */
function fold(el: HTMLElement, open: boolean, delay = 0) {
  const style = getComputedStyle(el);
  const full: Keyframe = { opacity: 1 };
  const flat: Keyframe = { opacity: 0 };
  for (const size of SIZES) {
    full[size] = size === 'height' ? `${el.offsetHeight}px` : style[size];
    flat[size] = '0px';
  }
  el.style.overflow = 'hidden';
  const move = el.animate(open ? [flat, full] : [full, flat], {
    duration: open ? IN : OUT,
    delay,
    easing: 'ease',
    fill: open ? 'backwards' : 'forwards',
  });
  if (open)
    void move.finished.then(
      () => (el.style.overflow = ''),
      () => {},
    );
}

function element(row: Row) {
  const el = Object.assign(document.createElement('div'), { className: row.kind });
  el.dataset.key = row.key;
  if (row.tokens) {
    const code = document.createElement('span');
    for (const token of row.tokens) {
      const part = Object.assign(document.createElement('span'), { textContent: token.content });
      if (token.color) part.style.color = token.color;
      code.append(part);
    }
    el.append(
      Object.assign(document.createElement('span'), {
        className: 'no',
        textContent: String(row.number ?? ''),
      }),
      code,
    );
  } else proseInto(el, row.text ?? '');
  return el;
}

/**
 * The code panel's rows, drawn by hand. A move goes in two parts: first what leaves or changes
 * does so (notes close, highlights fade, replaced lines are struck), then what is new opens.
 */
export class CodeStage {
  constructor(
    private lines: HTMLElement,
    private scroller: HTMLElement,
  ) {}

  keys() {
    return new Set([...this.lines.children].map((el) => (el as HTMLElement).dataset.key!));
  }

  /** The first part of a move. True when something is leaving or changing, and so needs its time. */
  leave(next: Row[]) {
    const kinds = new Map(next.map((row) => [row.key, row.kind]));
    let busy = false;
    for (const el of this.lines.children as Iterable<HTMLElement>) {
      const kind = kinds.get(el.dataset.key!);
      if (kind === el.className) continue;
      if (!kind) fold(el, false);
      else {
        el.className = kind;
        // The strike of a replaced line comes in gradually, like its colour.
        if (kind.includes('gone'))
          el.animate({ textDecorationColor: ['transparent', 'currentcolor'] }, { duration: OUT });
      }
      busy = true;
    }
    return busy;
  }

  /**
   * Puts the rows of a place on the panel. With `had` (the keys that were there before), whatever
   * is new opens row by row and the panel scrolls to it; `toLead` looks at the step's lead first.
   */
  show(next: Row[], had: Set<string> | null, toLead = false, scroll = true) {
    const top = this.scroller.scrollTop;
    this.lines.replaceChildren(...next.map(element));
    this.scroller.scrollTop = top;
    const rows = [...this.lines.children] as HTMLElement[];
    const fresh = had ? rows.filter((el) => !had.has(el.dataset.key!)) : [];
    // After a jump over many steps only this step's own additions open; the rest is simply there.
    const opening =
      fresh.length > 40
        ? fresh.filter((el) => el.matches('.ln.new, .walk-bubble, .walk-lead-in'))
        : fresh;
    opening.forEach((el, n) => fold(el, true, Math.min(n, 14) * EACH));
    if (!scroll) return;

    // Where to look: the lead on a phone, else the first thing this step has just added.
    const lead = this.lines.querySelector<HTMLElement>('.walk-lead-in');
    const target =
      (toLead && lead?.offsetParent ? lead : null) ??
      fresh.find((el) => el.offsetParent && el.matches('.ln.new, .walk-bubble')) ??
      this.lines.querySelector<HTMLElement>('.ln.new, .ln.gone');
    if (!target) return;
    const look = (behavior: ScrollBehavior) =>
      this.scroller.scrollTo({
        left: 0,
        top: Math.max(0, target.offsetTop - (target === lead ? 6 : 44)),
        behavior,
      });
    look(had ? 'smooth' : 'auto');
    // While the new rows are still closed the panel may be too short to scroll that far: once more when they are open.
    if (had)
      setTimeout(
        () => target.isConnected && look('smooth'),
        IN + Math.min(opening.length, 14) * EACH,
      );
  }
}
