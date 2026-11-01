import { describe, expect, it } from 'vitest';
import { matchCommand, suggestCommands } from '../../web/src/lib/commands.ts';

const commands = [
  { name: 'compact', hint: 'Summarize' },
  { name: 'rename', hint: 'Rename', args: '<name>', run: () => {} },
  { name: 'new', hint: 'New', run: () => {} },
];

describe('slash commands', () => {
  it('suggests while the name is typed, and stops after it', () => {
    expect(suggestCommands('/', commands).map((command) => command.name)).toEqual([
      'compact',
      'rename',
      'new',
    ]);
    expect(suggestCommands('/re', commands).map((command) => command.name)).toEqual(['rename']);
    expect(suggestCommands('/rename x', commands)).toEqual([]);
    expect(suggestCommands('hello /re', commands)).toEqual([]);
  });

  it('matches whole names only and passes on the rest', () => {
    expect(matchCommand('/rename  Pricing notes ', commands)).toMatchObject({
      command: { name: 'rename' },
      argument: 'Pricing notes',
    });
    expect(matchCommand('/renamed', commands)).toBeUndefined();
    expect(matchCommand('/tool read_file {}', commands)).toBeUndefined();
  });
});
