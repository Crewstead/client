import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * The PATH programs see in a terminal. Started from a menu or at login, the app gets a short system
 * PATH, so the computer service would not find `claude` installed with nvm or in ~/.local/bin. The
 * login shell is asked once (its startup output ignored), and common install folders are added.
 */
export function terminalPath(env = process.env) {
  if (process.platform === 'win32') return env.PATH ?? '';
  const found = new Set((env.PATH ?? '').split(delimiter).filter(Boolean));
  const shell = env.SHELL || '/bin/sh';
  const fish = shell.endsWith('/fish');
  try {
    const output = execFileSync(
      shell,
      [
        '-l',
        '-i',
        '-c',
        fish ? "printf '\\n@@%s@@\\n' (string join : $PATH)" : 'printf \'\\n@@%s@@\\n\' "$PATH"',
      ],
      {
        encoding: 'utf8',
        timeout: 5_000,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...env, TERM: 'dumb' },
      },
    );
    const asked = /@@(.*)@@/.exec(output)?.[1];
    for (const entry of asked?.split(':') ?? []) if (entry) found.add(entry);
  } catch {
    // No answer within 5 s, or no such shell: the folders below still help.
  }
  const home = env.HOME ?? homedir();
  const nvm = join(home, '.nvm', 'versions', 'node');
  const versions = existsSync(nvm) ? readdirSync(nvm).sort().reverse() : [];
  for (const folder of [
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    ...versions.map((version) => join(nvm, version, 'bin')),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ])
    if (existsSync(folder)) found.add(folder);
  return [...found].join(delimiter);
}
