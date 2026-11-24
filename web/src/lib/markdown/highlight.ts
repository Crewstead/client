import type { HighlighterCore, LanguageRegistration, ThemedToken } from 'shiki/core';

/** One line of a code block: its pieces and their colours (CSS variables from markdown.css). */
export type CodeLine = Array<Pick<ThemedToken, 'content' | 'color' | 'fontStyle'>>;

const THEME = 'crewstead';
let highlighter: Promise<HighlighterCore> | undefined;
const languages = new Map<string, Promise<string | undefined>>();

/** Shiki and each grammar load only when a reply first shows a code block in that language. */
function load() {
  highlighter ??= (async () => {
    const [{ createHighlighterCore, createCssVariablesTheme }, { createJavaScriptRegexEngine }] =
      await Promise.all([import('shiki/core'), import('shiki/engine/javascript')]);
    return createHighlighterCore({
      themes: [createCssVariablesTheme({ name: THEME, variablePrefix: '--code-' })],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  })();
  return highlighter;
}

/**
 * Shiki's Lean grammar sends `-- …` comments to a Markdown grammar it does not ship, which breaks
 * the whole comment rule; without that inner pattern they colour as comments again.
 */
function repair(grammars: LanguageRegistration[]) {
  return grammars.map((grammar) => {
    const dash = grammar.repository?.dashComment as { patterns?: unknown } | undefined;
    if (grammar.scopeName !== 'source.lean4' || !dash?.patterns) return grammar;
    const repository = { ...grammar.repository, dashComment: { ...dash, patterns: [] } };
    return { ...grammar, repository } as LanguageRegistration;
  });
}

/** The grammar's name once it is loaded, or nothing for a language Shiki does not know. */
function language(name: string) {
  const key = name.toLowerCase();
  if (!languages.has(key))
    languages.set(
      key,
      (async () => {
        const { bundledLanguages } = await import('shiki/langs');
        const grammar = bundledLanguages[key as keyof typeof bundledLanguages];
        if (!grammar) return undefined;
        await (await load()).loadLanguage(...repair((await grammar()).default));
        return key;
      })().catch(() => undefined),
    );
  return languages.get(key)!;
}

/** Coloured lines for `text`, or nothing when the language is unknown (shown as plain text). */
export async function highlight(text: string, name: string): Promise<CodeLine[] | undefined> {
  if (!name) return undefined;
  const lang = await language(name);
  if (!lang) return undefined;
  const { tokens } = (await load()).codeToTokens(text, { lang, theme: THEME });
  // Each line but the last ends in its line break, so the block renders as one run of spans.
  return tokens.map((line, index) => [
    ...line.map(({ content, color, fontStyle }) => ({ content, color, fontStyle })),
    ...(index < tokens.length - 1 ? [{ content: '\n' }] : []),
  ]);
}
