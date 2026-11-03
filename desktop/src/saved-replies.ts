import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** A reply larger than this is not kept (a long chat is far smaller). */
const MAX_BYTES = 4 * 1024 * 1024;
/** The most replies kept; the oldest go first. */
const MAX_FILES = 400;

/**
 * Copies of the hub's recent replies (the account, the chat list, chats it opened, settings), kept on
 * this computer so the app still shows them while the hub cannot be reached. Only for the account
 * that asked, only in this app's own folder (readable by this user alone), and removed on sign-out.
 * Live streams, files and anything that changes the hub are never kept.
 */
export class SavedReplies {
  constructor(private folder: string) {}

  /** Whether a GET of `path` is worth keeping: data the pages show, not streams or files. */
  static worthKeeping(path: string) {
    return !/\/(events|stream|screen|download)(\/|$)|^\/api\/(attachments|health)(\/|$)/.test(path);
  }

  private file(account: string, url: string) {
    const key = createHash('sha256').update(`${account}\n${url}`).digest('hex');
    return join(this.folder, `${key}.json`);
  }

  /** Passes `response` on, keeping a copy when it is JSON of a reasonable size. */
  async keep(account: string, url: string, response: Response) {
    const type = response.headers.get('Content-Type') ?? '';
    if (!type.includes('application/json')) return response;
    const body = await response.text();
    if (body.length <= MAX_BYTES) {
      try {
        await mkdir(this.folder, { recursive: true, mode: 0o700 });
        await writeFile(this.file(account, url), JSON.stringify({ at: Date.now(), type, body }), {
          mode: 0o600,
        });
        void this.trim();
      } catch {
        // Without a copy the app simply has less to show offline.
      }
    }
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  /** The saved copy, marked as one, or nothing. */
  async find(account: string, url: string) {
    try {
      const saved = JSON.parse(await readFile(this.file(account, url), 'utf8')) as {
        at: number;
        type: string;
        body: string;
      };
      return new Response(saved.body, {
        headers: {
          'Content-Type': saved.type,
          'X-Crewstead-Saved': new Date(saved.at).toISOString(),
        },
      });
    } catch {
      return undefined;
    }
  }

  async clear() {
    await rm(this.folder, { recursive: true, force: true });
  }

  private trimming = false;
  private async trim() {
    if (this.trimming) return;
    this.trimming = true;
    try {
      const names = await readdir(this.folder);
      if (names.length <= MAX_FILES) return;
      const dated = await Promise.all(
        names.map(async (name) => ({
          name,
          at: (await stat(join(this.folder, name)).catch(() => undefined))?.mtimeMs ?? 0,
        })),
      );
      dated.sort((a, b) => a.at - b.at);
      for (const { name } of dated.slice(0, names.length - MAX_FILES))
        await unlink(join(this.folder, name)).catch(() => undefined);
    } finally {
      this.trimming = false;
    }
  }
}
