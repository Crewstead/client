import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { ProjectToolArguments } from '@crewstead/core/protocol';
import { diffStats, unifiedDiff } from '@crewstead/core/policy';
import { projectPath } from './paths.ts';

/** What a tool returns: text for the model and, for changes, a diff for the owner. */
export interface ToolOutcome {
  output: string;
  diff?: string;
}

const SKIP = new Set(['.git', 'node_modules']);
const LIST_LIMIT = 500;
const READ_BYTES = 256 * 1024;

export async function listFiles(
  root: string,
  args: ProjectToolArguments<'list_files'>,
  /** Entries listed by name only, never opened (private places in a whole-computer chat). */
  closed?: (path: string) => boolean,
) {
  const { real, shown } = await projectPath(root, args.path ?? '.');
  if (!(await stat(real)).isDirectory()) throw new Error(`${shown} is not a folder.`);
  const lines: string[] = [];
  let truncated = false;
  async function walk(folder: string, depth: number) {
    const entries = (await readdir(folder, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      if (lines.length >= LIST_LIMIT) {
        truncated = true;
        return;
      }
      const full = join(folder, entry.name);
      const path = root === '/' ? full : relative(root, full);
      if (entry.isDirectory()) {
        const shut = closed?.(full);
        lines.push(`${path}/${shut ? ' (private: asks the owner to open)' : ''}`);
        if (!SKIP.has(entry.name) && !shut && depth > 1) await walk(full, depth - 1);
      } else lines.push(entry.isSymbolicLink() ? `${path} -> (link)` : path);
    }
  }
  await walk(real, args.depth ?? 2);
  if (!lines.length) return { output: `${shown} is empty.` };
  return {
    output: lines.join('\n') + (truncated ? `\n… stopped after ${LIST_LIMIT} entries.` : ''),
  };
}

async function readText(real: string, shown: string) {
  const info = await stat(real);
  if (!info.isFile()) throw new Error(`${shown} is not a file.`);
  if (info.size > 10 * 1024 * 1024) throw new Error(`${shown} is too large to read here.`);
  const buffer = await readFile(real);
  if (buffer.subarray(0, 8_000).includes(0)) throw new Error(`${shown} looks like a binary file.`);
  return buffer.toString('utf8');
}

export async function readProjectFile(root: string, args: ProjectToolArguments<'read_file'>) {
  const { real, shown } = await projectPath(root, args.path);
  const text = await readText(real, shown);
  // A final newline ends the last line; it does not start another one.
  const lines = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
  const start = (args.offset ?? 1) - 1;
  if (start >= lines.length && lines.length) throw new Error(`${shown} has ${lines.length} lines.`);
  let bytes = 0;
  const out: string[] = [];
  for (let index = start; index < Math.min(lines.length, start + (args.limit ?? 2_000)); index++) {
    const line = `${String(index + 1).padStart(6)}  ${lines[index]}`;
    bytes += line.length;
    if (bytes > READ_BYTES) break;
    out.push(line);
  }
  const end = start + out.length;
  const more =
    end < lines.length
      ? `\n… ${lines.length - end} more line${lines.length - end === 1 ? '' : 's'}; read on from ${end + 1}.`
      : '';
  return { output: (out.join('\n') || `${shown} is empty.`) + more };
}

/** Exact-text replacement, as Claude's and Codex's editors do it: the old text must be unique. */
export async function editProjectFile(
  root: string,
  args: ProjectToolArguments<'edit_file'>,
  apply: boolean,
): Promise<ToolOutcome> {
  const { real, shown } = await projectPath(root, args.path, { write: true });
  const before = await readText(real, shown);
  const count = before.split(args.old_text).length - 1;
  if (!count)
    throw new Error(`old_text was not found in ${shown}. Read the file and copy it exactly.`);
  if (count > 1 && !args.replace_all)
    throw new Error(
      `old_text appears ${count} times in ${shown}. Include more surrounding text, or set replace_all.`,
    );
  const after = args.replace_all
    ? before.split(args.old_text).join(args.new_text)
    : before.replace(args.old_text, () => args.new_text);
  const diff = unifiedDiff(shown, before, after);
  if (apply) await replaceFile(real, after);
  return {
    output: `${apply ? 'Edited' : 'Will edit'} ${shown} (${diffStats(diff)}).`,
    diff,
  };
}

export async function writeProjectFile(
  root: string,
  args: ProjectToolArguments<'write_file'>,
  apply: boolean,
): Promise<ToolOutcome> {
  const { real, shown } = await projectPath(root, args.path, { write: true });
  const before = await readText(real, shown).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  const diff = unifiedDiff(shown, before, args.content);
  if (apply) {
    await mkdir(dirname(real), { recursive: true });
    // The parent may have just been created; check again that it is still inside the project.
    await projectPath(root, shown, { write: true });
    await replaceFile(real, args.content);
  }
  const verb = before === undefined ? 'Created' : 'Replaced';
  return {
    output: `${apply ? verb : `Will ${verb.toLowerCase().replace(/d$/, '')}`} ${shown} (${diffStats(diff)}).`,
    diff,
  };
}

/** Writes through a temporary file and a rename, keeping the file's permissions. */
async function replaceFile(real: string, text: string) {
  const mode = await stat(real)
    .then((info) => info.mode & 0o777)
    .catch(() => 0o644);
  const temporary = `${real}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writeFile(temporary, text, { mode });
    await rename(temporary, real);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
