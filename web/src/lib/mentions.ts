/** The "@name" being typed just before the caret: where its "@" is and what follows it so far. */
export function mentionAt(text: string, caret: number) {
  const match = /(?:^|[\s(["'])@([a-z0-9-]*)$/.exec(text.slice(0, caret));
  if (!match) return undefined;
  const query = match[1]!;
  return { start: caret - query.length - 1, query };
}

/** Replaces the mention being typed with "@name ", returning the new text and caret. */
export function insertMention(text: string, at: { start: number }, caret: number, name: string) {
  const inserted = `@${name} `;
  const rest = text.slice(caret).replace(/^[a-z0-9-]*\s?/, '');
  return { text: text.slice(0, at.start) + inserted + rest, caret: at.start + inserted.length };
}
