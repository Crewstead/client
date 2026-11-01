import { describe, expect, it } from 'vitest';
import { parseBlocks } from '../../web/src/lib/markdown/blocks.ts';
import { parseInline } from '../../web/src/lib/markdown/inline.ts';

describe('Markdown inline', () => {
  it('reads emphasis, code and links, and leaves snake_case and unclosed markers alone', () => {
    expect(parseInline('**bold** and *it* with `code` in file_name_here')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'bold' }] },
      { type: 'text', text: ' and ' },
      { type: 'em', children: [{ type: 'text', text: 'it' }] },
      { type: 'text', text: ' with ' },
      { type: 'code', text: 'code' },
      { type: 'text', text: ' in file_name_here' },
    ]);
    expect(parseInline('half **written')).toEqual([{ type: 'text', text: 'half **written' }]);
  });
  it('keeps only http, https and mailto links; other targets become plain text', () => {
    expect(parseInline('[site](https://example.com/a)')).toEqual([
      { type: 'link', href: 'https://example.com/a', children: [{ type: 'text', text: 'site' }] },
    ]);
    expect(parseInline('[click](javascript:alert(1))')).toEqual([
      { type: 'text', text: 'click' },
      { type: 'text', text: ')' },
    ]);
    expect(parseInline('see https://example.com/x.')).toEqual([
      { type: 'text', text: 'see ' },
      {
        type: 'link',
        href: 'https://example.com/x',
        children: [{ type: 'text', text: 'https://example.com/x' }],
      },
      { type: 'text', text: '.' },
    ]);
  });
  it('never turns markup into HTML: angle brackets stay text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'text', text: '<img src=x onerror=alert(1)>' },
    ]);
  });
});

describe('Markdown blocks', () => {
  it('reads headings, paragraphs with line breaks, rules and quotes', () => {
    const blocks = parseBlocks('# Title\n\nline one\nline two\n\n---\n\n> quoted');
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'rule', 'quote']);
    expect(blocks[1]).toMatchObject({
      content: [{ text: 'line one' }, { type: 'break' }, { text: 'line two' }],
    });
  });
  it('runs an unclosed code fence to the end, as while a reply is streaming', () => {
    expect(parseBlocks('Run:\n```bash\nnpm test\nnpm run')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Run:' }] },
      { type: 'code', language: 'bash', text: 'npm test\nnpm run' },
    ]);
  });
  it('reads nested and numbered lists', () => {
    const [list] = parseBlocks('3. first\n4. second\n   - inner\n   - more');
    expect(list).toMatchObject({ type: 'list', ordered: true, start: 3 });
    const items = (list as { items: unknown[][] }).items;
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject([
      { type: 'paragraph' },
      { type: 'list', ordered: false, items: [[{ type: 'paragraph' }], [{ type: 'paragraph' }]] },
    ]);
  });
  it('reads tables with column alignment', () => {
    const [table] = parseBlocks('| Name | Price |\n|:--|--:|\n| a | $1 |\n| b | $2 |');
    expect(table).toMatchObject({ type: 'table', align: ['left', 'right'] });
    expect((table as { rows: unknown[] }).rows).toHaveLength(2);
  });
  it('starts a table right after a line of text, as models often write it', () => {
    const blocks = parseBlocks('**Results:**\n| Name | Price |\n|---|---|\n| a | $1 |\nAfter it');
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'table', 'paragraph']);
    // A pipe in an ordinary sentence stays text.
    expect(parseBlocks('a | b\nmore text').map((block) => block.type)).toEqual(['paragraph']);
  });
});
