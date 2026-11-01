/** Inline Markdown as plain data; rendered as Svelte elements, never as HTML strings. */
export type Inline =
  | { type: 'text'; text: string }
  | { type: 'break' }
  | { type: 'code'; text: string }
  | { type: 'strong' | 'em' | 'del'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

/** Only these link targets are kept; anything else (javascript:, data:, …) stays plain text. */
export function safeHref(raw: string) {
  try {
    const url = new URL(raw.trim());
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const delimiters: Array<[string, 'strong' | 'em' | 'del']> = [
  ['**', 'strong'],
  ['__', 'strong'],
  ['~~', 'del'],
  ['*', 'em'],
  ['_', 'em'],
];

/** Parses one paragraph's inline content. Unclosed markers (common mid-stream) stay as text. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    if (rest[0] === '\\' && /^\\[\\`*_~[\]()#>!|-]/.test(rest)) {
      text += rest[1];
      i += 2;
      continue;
    }
    if (rest[0] === '\n') {
      flush();
      out.push({ type: 'break' });
      i++;
      continue;
    }
    const code = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest);
    if (code) {
      flush();
      out.push({ type: 'code', text: code[2]!.replace(/^ (.*) $/, '$1') });
      i += code[0].length;
      continue;
    }
    const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      const href = safeHref(link[2]!);
      flush();
      if (href) out.push({ type: 'link', href, children: parseInline(link[1]!) });
      else out.push(...parseInline(link[1]!));
      i += link[0].length;
      continue;
    }
    const bare = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/.exec(rest);
    if (bare && !/[\w/]$/.test(text)) {
      flush();
      out.push({ type: 'link', href: bare[0], children: [{ type: 'text', text: bare[0] }] });
      i += bare[0].length;
      continue;
    }
    const marker = delimiters.find(([open]) => rest.startsWith(open));
    if (marker) {
      const [open, type] = marker;
      // `_` only works at word edges, so snake_case names stay intact.
      const wordInner = open.startsWith('_') && /\w$/.test(text);
      const end = wordInner ? -1 : rest.indexOf(open, open.length + 1);
      const inner = end > 0 ? rest.slice(open.length, end) : '';
      if (end > 0 && inner.trim() === inner && !inner.includes('\n\n')) {
        flush();
        out.push({ type, children: parseInline(inner) });
        i += end + open.length;
        continue;
      }
    }
    text += rest[0];
    i++;
  }
  flush();
  return out;
}
