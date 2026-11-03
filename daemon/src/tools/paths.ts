import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Paths the tools never write to; Git metadata is also read-only inside the command sandbox. */
const PROTECTED = /(^|[\\/])\.git([\\/]|$)/;

/**
 * Resolves a path the model gave, relative to the project, through any symbolic links, and refuses
 * anything that ends up outside the project folder. Checked at use, so a swapped link is caught.
 * The root "/" is the whole computer: paths are absolute and shown as such.
 */
export async function projectPath(root: string, path: string, options: { write?: boolean } = {}) {
  const whole = root === '/';
  if ((isAbsolute(path) && !whole) || path.includes('\0'))
    throw new Error('Use a path relative to the project folder.');
  const target = resolve(root, path);
  if (!within(root, target)) throw new Error(`${path} is outside the project folder.`);
  // Resolve the deepest part that exists; a new file's folder must resolve inside the project too.
  let existing = target;
  const missing: string[] = [];
  for (;;) {
    try {
      existing = await realpath(existing);
      break;
    } catch {
      // Up to the root of a drive that is not there (Windows): nothing exists to resolve.
      if (existing === root || dirname(existing) === existing)
        throw new Error('The project folder is missing.');
      missing.unshift(relative(dirname(existing), existing));
      existing = dirname(existing);
    }
  }
  const real = join(existing, ...missing);
  if (!within(root, real)) throw new Error(`${path} leads outside the project folder.`);
  const shown = whole ? real : relative(root, real) || '.';
  if (options.write) {
    if (PROTECTED.test(shown)) throw new Error('Git metadata cannot be changed with these tools.');
    const stat = await lstat(real).catch(() => undefined);
    if (stat?.isDirectory()) throw new Error(`${shown} is a folder.`);
  }
  return { real, shown };
}

export function within(root: string, path: string) {
  // The whole computer holds every path, on every drive (Windows has no single "/").
  if (root === '/') return true;
  return path === root || path.startsWith(root === sep ? root : root + sep);
}
