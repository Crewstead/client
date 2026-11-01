/** Results longer than this fold away on a tool card, behind a one-line summary. */
const LONG = 280;

/**
 * How a tool's result shows on its card. A browser page snapshot (written for the model) becomes
 * "title — address"; other long results show their first line. `full` is set when there is more.
 */
export function resultSummary(result: string, browser: boolean): { line: string; full?: string } {
  const address = /^Address: (.+)$/m.exec(result)?.[1];
  if (browser && address) {
    const title = /^Title: (.+)$/m.exec(result)?.[1]?.trim();
    const owner = result.startsWith('The owner used this browser') ? ' (after your changes)' : '';
    return { line: `${title ? `${title} — ` : ''}${address}${owner}`, full: result };
  }
  if (result.length <= LONG) return { line: result };
  const first = result.split('\n')[0]!;
  return { line: first.length > LONG ? `${first.slice(0, LONG)}…` : first, full: result };
}

/** A command's result folded to its first line: how it ended and how much it printed. */
export function commandSummary(result: string) {
  const [status = '', ...rest] = result.split('\n');
  const body = rest.join('\n').trim();
  const lines = !body || body === '(no output)' ? 0 : body.split('\n').length;
  return {
    line: `${status.replace(/^Exit code: /, 'Exit code ')} · ${lines ? `${lines} line${lines === 1 ? '' : 's'} of output` : 'no output'}`,
    failed: !/^Exit code: 0$/.test(status),
  };
}
