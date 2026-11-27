/** A run of prose: plain text, `code`, or a [[term]] the reader can open ([[term|other words]]). */
export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'term'; text: string; key: string };

export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(/`([^`]+)`|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    if (match.index > last) out.push({ kind: 'text', text: text.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ kind: 'code', text: match[1] });
    else out.push({ kind: 'term', key: match[2]!.toLowerCase(), text: match[3] ?? match[2]! });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** The same prose as nodes, for the code panel, which is drawn by hand so its rows can slide. */
export function proseInto(parent: HTMLElement, text: string) {
  for (const part of segments(text)) {
    if (part.kind === 'text') parent.append(part.text);
    else if (part.kind === 'code')
      parent.append(Object.assign(document.createElement('code'), { textContent: part.text }));
    else {
      const term = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'walk-term',
        textContent: part.text,
      });
      term.dataset.term = part.key;
      parent.append(term);
    }
  }
}
