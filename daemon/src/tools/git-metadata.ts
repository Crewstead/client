import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What a sandbox protects in a project's Git metadata, on Linux (bubblewrap) and on Windows
 * (crewstead-sandbox.exe) alike.
 */

/** Where Git keeps what it runs or obeys: hooks, and config that can name programs to run. */
const GIT_RUNS = ['hooks', 'config', 'config.worktree'];

/**
 * With Git allowed, the paths that stay read-only: hooks and config in the repository and in its
 * submodules and worktrees. A hook or `core.fsmonitor` a chat wrote would otherwise run, outside the
 * sandbox, the next time the owner used Git. A missing hooks folder is made, so it can be held.
 */
export function gitRuns(root: string): string[] {
  const git = join(root, '.git');
  if (!existsSync(git) || !statSync(git).isDirectory()) return [];
  return [git, ...gitFolders(join(git, 'modules'), 3), ...gitFolders(join(git, 'worktrees'), 1)]
    .flatMap((folder) => GIT_RUNS.map((entry) => join(folder, entry)))
    .map((path) => {
      if (path.endsWith('hooks') && !existsSync(path)) mkdirSync(path);
      return path;
    });
}

/**
 * Git metadata in the bubblewrap sandbox. Read-only by default. With Git allowed, commits, branches
 * and the index may change, but `gitRuns` stay as the owner left them (a missing one held empty, so a
 * chat cannot put one there). A `.git` file (a worktree elsewhere) stays read-only.
 */
export function gitMetadata(root: string, writable: boolean) {
  const git = join(root, '.git');
  if (!existsSync(git)) return [];
  if (!writable || !statSync(git).isDirectory()) return ['--ro-bind', git, git];
  return gitRuns(root).flatMap((path) => [
    '--ro-bind',
    existsSync(path) ? path : '/dev/null',
    path,
  ]);
}

/** Git folders (those with a HEAD) under `folder`, up to `depth` levels down. */
function gitFolders(folder: string, depth: number): string[] {
  if (depth === 0 || !existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .flatMap((entry) => {
      const path = join(folder, entry.name);
      return existsSync(join(path, 'HEAD')) ? [path] : gitFolders(path, depth - 1);
    });
}

/**
 * The owner's Git name and email as Git sees them here, for commits in the sandbox: where they live
 * in a hidden folder (~/.config/git), Git there could not find them.
 */
export function gitIdentity(root: string): Record<string, string> {
  const read = (key: string) =>
    spawnSync('git', ['-C', root, 'config', '--get', key], {
      encoding: 'utf8',
      timeout: 5_000,
    }).stdout?.trim() ?? '';
  const name = read('user.name');
  const email = read('user.email');
  return {
    ...(name ? { GIT_AUTHOR_NAME: name, GIT_COMMITTER_NAME: name } : {}),
    ...(email ? { GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_EMAIL: email } : {}),
  };
}
