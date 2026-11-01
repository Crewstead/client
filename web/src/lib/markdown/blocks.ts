import { parseInline, type Inline } from './inline.ts';

export type Align = 'left' | 'center' | 'right' | undefined;
export type Block =
  | { type: 'heading'; level: number; content: Inline[] }
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'code'; language: string; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { type: 'rule' };

const fence = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const rule = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const bullet = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const divider = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
/** A table's header row: a line with pipes, followed by its divider row. */
const startsTable = (lines: string[], i: number) =>
  lines[i]!.includes('|') && divider.test(lines[i + 1] ?? '');
const startsBlock = (line: string) =>
  fence.test(line) ||
  heading.test(line) ||
  rule.test(line) ||
  /^\s*>/.test(line) ||
  bullet.test(line);

/**
 * Parses Markdown into plain block data. Tolerant of half-written input: an unclosed code fence
 * runs to the end, so a reply still streaming renders sensibly.
 */
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const open = fence.exec(line);
    if (open) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(open[1]!)) body.push(lines[i++]!);
      i++;
      blocks.push({ type: 'code', language: open[2] ?? '', text: body.join('\n') });
      continue;
    }
    const title = heading.exec(line);
    if (title) {
      blocks.push({ type: 'heading', level: title[1]!.length, content: parseInline(title[2]!) });
      i++;
      continue;
    }
    if (rule.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!))
        body.push(lines[i++]!.replace(/^\s*> ?/, ''));
      blocks.push({ type: 'quote', blocks: parseBlocks(body.join('\n')) });
      continue;
    }
    if (startsTable(lines, i)) {
      const align = cells(lines[i + 1]!).map((cell): Align =>
        cell.startsWith(':') && cell.endsWith(':')
          ? 'center'
          : cell.endsWith(':')
            ? 'right'
            : cell.startsWith(':')
              ? 'left'
              : undefined,
      );
      const head = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim())
        rows.push(cells(lines[i++]!).map(parseInline));
      blocks.push({ type: 'table', align, head, rows });
      continue;
    }
    const item = bullet.exec(line);
    if (item) {
      const indent = item[1]!.length;
      const ordered = /\d/.test(item[2]!);
      const items: string[][] = [];
      while (i < lines.length) {
        const current = lines[i]!;
        const marker = bullet.exec(current);
        if (marker && marker[1]!.length === indent && /\d/.test(marker[2]!) === ordered) {
          items.push([marker[3]!]);
          i++;
          continue;
        }
        const nested = current.length - current.trimStart().length > indent;
        const blankThenNested =
          !current.trim() &&
          (lines[i + 1] ?? '').length - (lines[i + 1] ?? '').trimStart().length > indent;
        if (nested || blankThenNested) {
          items
            .at(-1)!
            .push(current.slice(Math.min(indent + 2, current.length - current.trimStart().length)));
          i++;
          continue;
        }
        break;
      }
      blocks.push({
        type: 'list',
        ordered,
        start: ordered ? Number.parseInt(item[2]!, 10) : 1,
        items: items.map((body) => parseBlocks(body.join('\n'))),
      });
      continue;
    }
    const body: string[] = [];
    // Like GitHub, a table may follow a line of text directly, e.g. a bold caption.
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      (body.length === 0 || !(startsBlock(lines[i]!) || startsTable(lines, i)))
    )
      body.push(lines[i++]!);
    blocks.push({ type: 'paragraph', content: parseInline(body.join('\n')) });
  }
  return blocks;
}
