/** KaTeX and its stylesheet load only when a reply first shows a formula. */
let katex: Promise<typeof import('katex').default> | undefined;

function load() {
  katex ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
    ([module]) => module.default,
  );
  return katex;
}

/**
 * A formula as KaTeX markup, or nothing when it does not parse (then the source shows as is).
 * `trust` stays off, so commands like \href and \includegraphics never render.
 */
export async function renderMath(tex: string, display: boolean): Promise<string | undefined> {
  const { renderToString } = await load();
  try {
    return renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      output: 'htmlAndMathml',
    });
  } catch {
    return undefined;
  }
}
