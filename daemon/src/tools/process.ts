import { spawn, type SpawnOptions } from 'node:child_process';

const HEAD = 32 * 1024;
const TAIL = 32 * 1024;

/**
 * Runs a program to the end, or until the time limit or a stop, and returns its exit code and output:
 * the first and last 32 KB, with what was left out in between counted.
 */
export async function runProcess(
  file: string,
  argv: string[],
  options: SpawnOptions,
  seconds: number,
  signal: AbortSignal,
  how: {
    /** Called with all output so far whenever more arrives. */
    onOutput?: ((output: string) => void) | undefined;
    /** What to say when the program is not installed. */
    missing: string;
  },
) {
  let head = '';
  let tail = '';
  let dropped = 0;
  const collect = (part: string) => {
    if (head.length < HEAD) {
      const room = HEAD - head.length;
      head += part.slice(0, room);
      part = part.slice(room);
    }
    tail += part;
    if (tail.length > TAIL) {
      dropped += tail.length - TAIL;
      tail = tail.slice(-TAIL);
    }
    how.onOutput?.(head + tail);
  };
  let timedOut = false;
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(file, argv, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    // A detached program leads its own process group; stopping it stops everything it started.
    const stop = () => {
      if (options.detached && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
          return;
        } catch {
          // Already gone, or not a group leader: stop the program itself.
        }
      }
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, seconds * 1_000);
    signal.addEventListener('abort', stop, { once: true });
    child.stdout!.setEncoding('utf8').on('data', collect);
    child.stderr!.setEncoding('utf8').on('data', collect);
    child.on('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'ENOENT' ? new Error(how.missing) : error),
    );
    child.on('close', (status) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      resolve(status);
    });
  });
  signal.throwIfAborted();
  const output = head + (dropped ? `\n… ${dropped} characters of output left out …\n` : '') + tail;
  const status = timedOut ? `Stopped after ${seconds} s (time limit).` : `Exit code: ${code}`;
  return { output: `${status}\n${output.trimEnd() || '(no output)'}` };
}
