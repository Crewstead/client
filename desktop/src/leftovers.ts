import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';

/** How this app runs its computer service: its bundled `build/daemon/main.mjs`, then `run` or `connect`. */
export const APP_SERVICE =
  /app\.asar\.unpacked[\\/]build[\\/]daemon[\\/]main\.mjs"?\s+(run|connect)\b/;
const GRACE_MS = 5_000;

/** This user's processes and their command lines; empty when they cannot be listed. */
async function processes(): Promise<Array<{ pid: number; command: string }>> {
  try {
    if (process.platform === 'linux') {
      const uid = process.getuid?.();
      const found = await Promise.all(
        (await readdir('/proc'))
          .filter((name) => /^\d+$/.test(name))
          .map(async (name) => {
            try {
              if ((await stat(`/proc/${name}`)).uid !== uid) return undefined;
              const command = (await readFile(`/proc/${name}/cmdline`, 'utf8')).replaceAll(
                '\0',
                ' ',
              );
              return { pid: Number(name), command };
            } catch {
              return undefined; // It ended meanwhile.
            }
          }),
      );
      return found.filter((entry) => entry !== undefined);
    }
    const { stdout } =
      process.platform === 'win32'
        ? await promisify(execFile)(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }',
            ],
            { windowsHide: true, maxBuffer: 16_000_000 },
          )
        : await promisify(execFile)('ps', ['-axww', '-o', 'pid=,command='], {
            maxBuffer: 16_000_000,
          });
    return stdout.split('\n').flatMap((line) => {
      const match = /^\s*(\d+)\s+(.*)$/.exec(line);
      return match ? [{ pid: Number(match[1]), command: match[2]! }] : [];
    });
  } catch {
    return [];
  }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Stops computer services that earlier runs of this app left behind, other than `keep`: asked to stop
 * first, so their replies end cleanly, then ended after a few seconds. Services run some other way
 * (e.g. the `crewstead` command) are not this app's and are left alone.
 */
export async function stopLeftoverServices(keep?: number, service = APP_SERVICE) {
  const leftovers = (await processes()).filter(
    (entry) => entry.pid !== process.pid && entry.pid !== keep && service.test(entry.command),
  );
  for (const { pid } of leftovers) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Gone already, or not ours to stop.
    }
  }
  const until = Date.now() + GRACE_MS;
  while (leftovers.some(({ pid }) => alive(pid)) && Date.now() < until)
    await new Promise((resolve) => setTimeout(resolve, 200));
  for (const { pid } of leftovers)
    if (alive(pid))
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Ended just now.
      }
  return leftovers.map(({ pid }) => pid);
}
