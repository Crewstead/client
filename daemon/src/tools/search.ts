import type { ProjectToolArguments } from '@crewstead/core/protocol';
import { projectPath } from './paths.ts';
import { searchWithNode } from './search-node.ts';

const MATCH_LIMIT = 200;

/** Searches a project's files (read-only); output lines are "path:line:text". */
export async function searchProject(
  root: string,
  args: ProjectToolArguments<'search_files'>,
  signal: AbortSignal,
  /** Folders and files never searched (private places in a whole-computer chat). */
  exclude: string[] = [],
) {
  const { shown } = await projectPath(root, args.path ?? '.');
  const lines = await searchWithNode(root, shown, {
    pattern: args.pattern,
    ignoreCase: args.ignore_case,
    glob: args.glob,
    exclude,
    perFile: 50,
    limit: MATCH_LIMIT,
    signal,
  });
  if (!lines.length) return { output: 'No matches.' };
  const more = lines.length > MATCH_LIMIT;
  return {
    output:
      lines.slice(0, MATCH_LIMIT).join('\n') +
      (more ? `\n… more than ${MATCH_LIMIT} matches; narrow the search.` : ''),
  };
}
