import { open, opendir } from 'node:fs/promises';
import { join } from 'node:path';

/** Never searched; files larger than this, or binary, are not read. */
const SKIPPED = new Set(['.git', 'node_modules']);
const LARGEST = 4 * 1024 * 1024;
/** A walk of more files than this stops (a whole computer); the matches so far are kept. */
const FILES_LIMIT = 200_000;

/** A glob ("*.ts", "src/**\/*.svelte", "*.{js,ts}") as a regular expression. */
export function globPattern(glob: string) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      out += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '{') out += '(?:';
    else if (c === '}') out += ')';
    else if (c === ',' && out.includes('(?:')) out += '|';
    else if (c === '[') {
      const end = glob.indexOf(']', i);
      out += end > i ? glob.slice(i, end + 1) : '\\[';
      if (end > i) i = end;
    } else out += c.replace(/[.+^$()|\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** Whether a path matches a glob: one without "/" matches the file's name anywhere. */
const matches = (glob: RegExp, slashed: boolean, path: string) =>
  glob.test(slashed ? path : path.slice(path.lastIndexOf('/') + 1));

/**
 * Searches files under `start` (a folder or one file, under `root`) for a regular expression, with no
 * program needed on the computer: `.git` and `node_modules` skipped, an optional glob, at most
 * `perFile` matches a file, lines cut at 300 characters, output lines "path:line:text". Stops after
 * `limit` + 1 matches.
 */
export async function searchWithNode(
  root: string,
  start: string,
  options: {
    pattern: string;
    ignoreCase?: boolean | undefined;
    glob?: string | undefined;
    exclude: string[];
    perFile: number;
    limit: number;
    signal: AbortSignal;
  },
) {
  let expression: RegExp;
  try {
    expression = new RegExp(options.pattern, options.ignoreCase ? 'i' : '');
  } catch (error) {
    throw new Error(`The pattern is not a valid regular expression: ${(error as Error).message}`, {
      cause: error,
    });
  }
  const negated = options.glob?.startsWith('!');
  const glob = options.glob ? globPattern(options.glob.replace(/^!/, '')) : undefined;
  const slashed = !!options.glob?.includes('/');
  const lines: string[] = [];
  let files = 0;
  const visit = async (relative: string): Promise<void> => {
    if (options.signal.aborted || lines.length > options.limit || files > FILES_LIMIT) return;
    const directory = await opendir(join(root, relative)).catch(() => undefined);
    if (!directory) return;
    for await (const entry of directory) {
      if (lines.length > options.limit || files > FILES_LIMIT) break;
      if (SKIPPED.has(entry.name) || options.exclude.includes(entry.name)) continue;
      const path = relative === '.' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        files++;
        if (glob && matches(glob, slashed, path) === !!negated) continue;
        await searchFile(join(root, path), path);
      }
    }
  };
  const searchFile = async (full: string, path: string) => {
    const handle = await open(full, 'r').catch(() => undefined);
    if (!handle) return;
    try {
      const { size } = await handle.stat();
      if (size > LARGEST) return;
      const data = await handle.readFile();
      // Binary files (a NUL byte early on) are skipped.
      if (data.subarray(0, 8000).includes(0)) return;
      let found = 0;
      const text = data.toString('utf8').split(/\r?\n/);
      for (let i = 0; i < text.length && found < options.perFile; i++) {
        if (!expression.test(text[i]!)) continue;
        found++;
        lines.push(`${path}:${i + 1}:${text[i]!.slice(0, 300)}`);
        if (lines.length > options.limit) return;
      }
    } finally {
      await handle.close();
    }
  };
  if (start === '.') await visit('.');
  else {
    const kind = await opendir(join(root, start))
      .then(async (directory) => (await directory.close(), 'folder'))
      .catch(() => 'file');
    if (kind === 'folder') await visit(start);
    else await searchFile(join(root, start), start);
  }
  return lines;
}
