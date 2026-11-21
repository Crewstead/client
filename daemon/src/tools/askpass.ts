import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/** Asks the owner for the password sudo wants; null when they decline or the command ends. */
export type AskPassword = (text: string, signal: AbortSignal) => Promise<string | null>;

const SUDO = ['/usr/bin/sudo', '/bin/sudo', '/usr/local/bin/sudo', '/run/wrappers/bin/sudo'];

/** Run by sudo (SUDO_ASKPASS): asks the daemon over its private socket and prints the answer. */
const HELPER = (socket: string) => `import { connect } from 'node:net';
const link = connect(${JSON.stringify(socket)});
let answer = '';
link.setEncoding('utf8');
link.on('data', (part) => (answer += part));
link.on('error', () => process.exit(1));
link.on('end', () => {
  const reply = JSON.parse(answer || '{}');
  if (typeof reply.password !== 'string') process.exit(1);
  process.stdout.write(reply.password + '\\n');
});
link.write(JSON.stringify({ token: process.env.CREWSTEAD_ASKPASS ?? '', pid: process.pid, text: process.argv[2] ?? '' }) + '\\n');
`;

const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * sudo in approved whole-computer commands: a `sudo` first on their PATH runs the real one with
 * `-A -k`, so every sudo asks (no reuse of an earlier password) through SUDO_ASKPASS, which asks the
 * owner in the app. Only a helper that sudo itself started gets the answer: the asker's parent must be
 * a sudo process running as root, and two askers claiming one process cancel the question.
 */
export class Askpass {
  private sessions = new Map<string, AskPassword>();

  private constructor(
    private folder: string,
    private server: Server,
    private trusted: (pid: number) => boolean,
  ) {}

  /**
   * Starts it where sudo is installed (not on Windows); undefined elsewhere. `trusted` says whether a
   * process may get the answer (tests stand in for sudo).
   */
  static async start(trusted = startedBySudo): Promise<Askpass | undefined> {
    const sudo = process.platform === 'win32' ? undefined : SUDO.find((path) => existsSync(path));
    if (!sudo) return undefined;
    const folder = await mkdtemp(join(tmpdir(), 'crewstead-askpass-'));
    await chmod(folder, 0o700);
    const socket = join(folder, 'socket');
    await mkdir(join(folder, 'bin'));
    await writeFile(join(folder, 'askpass.mjs'), HELPER(socket));
    const helper = `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quote(process.execPath)} ${quote(join(folder, 'askpass.mjs'))} "$@"\n`;
    await writeFile(join(folder, 'askpass'), helper, { mode: 0o700 });
    await writeFile(join(folder, 'bin', 'sudo'), `#!/bin/sh\nexec ${quote(sudo)} -A -k "$@"\n`, {
      mode: 0o700,
    });
    const askpass: Askpass = new Askpass(
      folder,
      createServer((link) => askpass.answer(link)),
      trusted,
    );
    await new Promise<void>((resolve, reject) =>
      askpass.server.once('error', reject).listen(socket, resolve),
    );
    return askpass;
  }

  /** What a command's environment needs for sudo to ask through `ask`; `end` when it is done. */
  session(path: string | undefined, ask: AskPassword) {
    const token = randomBytes(16).toString('hex');
    this.sessions.set(token, ask);
    return {
      env: {
        PATH: [join(this.folder, 'bin'), path].filter(Boolean).join(delimiter),
        SUDO_ASKPASS: join(this.folder, 'askpass'),
        CREWSTEAD_ASKPASS: token,
      },
      end: () => this.sessions.delete(token),
    };
  }

  private claims = new Map<number, AbortController>();

  private answer(link: Socket) {
    let line = '';
    link.setEncoding('utf8');
    link.on('error', () => undefined);
    const reply = (password: string | null) =>
      link.end(JSON.stringify(password === null ? {} : { password }));
    const read = (part: string) => {
      line += part;
      if (!line.includes('\n')) return line.length > 4_096 ? link.destroy() : undefined;
      link.off('data', read);
      let asked: { token?: unknown; pid?: unknown; text?: unknown };
      try {
        asked = JSON.parse(line.slice(0, line.indexOf('\n'))) as typeof asked;
      } catch {
        return link.destroy();
      }
      const ask = typeof asked.token === 'string' ? this.sessions.get(asked.token) : undefined;
      const pid = Number(asked.pid);
      if (!ask || !Number.isInteger(pid) || !this.trusted(pid)) return reply(null);
      const earlier = this.claims.get(pid);
      if (earlier) {
        // Someone else speaks for the same helper: answer neither.
        earlier.abort();
        return reply(null);
      }
      const controller = new AbortController();
      this.claims.set(pid, controller);
      link.on('close', () => controller.abort());
      const text = typeof asked.text === 'string' ? asked.text.slice(0, 200) : '';
      ask(text || 'Password:', controller.signal)
        .then((password) => (controller.signal.aborted ? reply(null) : reply(password)))
        .catch(() => reply(null))
        .finally(() => this.claims.delete(pid));
    };
    link.on('data', read);
  }

  async stop() {
    this.server.close();
    await rm(this.folder, { recursive: true, force: true });
  }
}

/** On Linux, the asker's parent must be sudo running as root (a user's own program cannot be). */
function startedBySudo(pid: number) {
  if (process.platform !== 'linux') return true;
  const field = (id: number, name: string) => {
    try {
      const status = readFileSync(`/proc/${id}/status`, 'utf8');
      return status.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
    } catch {
      return '';
    }
  };
  const parent = Number(field(pid, 'PPid'));
  return (
    parent > 1 &&
    field(parent, 'Name') === 'sudo' &&
    field(parent, 'Uid').split(/\s+/).includes('0')
  );
}
