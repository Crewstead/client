import { spawn } from 'node:child_process';
import type { ProjectToolArguments } from '@crewstead/core/protocol';
import { projectPath } from './paths.ts';

const MATCH_LIMIT = 200;

/** Searches with ripgrep (read-only, argument list, no shell); output lines are "path:line:text". */
export async function searchProject(
  root: string,
  args: ProjectToolArguments<'search_files'>,
  signal: AbortSignal,
  ripgrep = 'rg',
  /** Folders and files never searched (private places in a whole-computer chat). */
  exclude: string[] = [],
) {
  const { shown } = await projectPath(root, args.path ?? '.');
  const argv = ['--line-number', '--no-heading', '--color=never', '--max-columns=300'];
  argv.push('--max-count=50', '--glob=!.git', '--glob=!node_modules');
  if (args.ignore_case) argv.push('--ignore-case');
  if (args.glob) argv.push(`--glob=${args.glob}`);
  // After the model's glob: the last matching glob wins in ripgrep.
  for (const entry of exclude) argv.push(`--glob=!**/${entry}`, `--glob=!**/${entry}/**`);
  argv.push('--regexp', args.pattern);
  // Searching the whole project without a path keeps results as plain project paths.
  if (shown !== '.') argv.push('--', shown);
  const lines: string[] = [];
  let errors = '';
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(ripgrep, argv, { cwd: root, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let rest = '';
    child.stdout.setEncoding('utf8').on('data', (part: string) => {
      const parts = (rest + part).split('\n');
      rest = parts.pop() ?? '';
      for (const line of parts) if (lines.length <= MATCH_LIMIT) lines.push(line);
      if (lines.length > MATCH_LIMIT) child.kill();
    });
    child.stderr.setEncoding('utf8').on('data', (part: string) => (errors += part));
    child.on('error', (error: NodeJS.ErrnoException) =>
      reject(
        error.code === 'ENOENT' ? new Error('Search needs ripgrep (rg) on this computer.') : error,
      ),
    );
    child.on('close', (status) => resolve(status ?? 0));
  });
  if (code === 2 && !lines.length) throw new Error(errors.trim().slice(0, 500) || 'Search failed.');
  if (!lines.length) return { output: 'No matches.' };
  const more = lines.length > MATCH_LIMIT;
  return {
    output:
      lines.slice(0, MATCH_LIMIT).join('\n') +
      (more ? `\n… more than ${MATCH_LIMIT} matches; narrow the search.` : ''),
  };
}
