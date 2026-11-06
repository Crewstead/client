import { mcpServers } from './api.ts';

const POLL_MS = 2_000;

/** The desktop app's return page on this computer (desktop/src/oauth-return.ts), if this is it. */
const returnPage = () =>
  (globalThis as { crewsteadDesktop?: { oauthReturn?: () => Promise<number | string> } })
    .crewsteadDesktop?.oauthReturn;

/** Whether a sign-in can come back through this computer: only in the desktop app. */
export const canReturnHere = () => !!returnPage();
const WAIT_MS = 5 * 60_000;

/**
 * Opens a server's sign-in page and watches for the sign-in to land. In the Crewstead app the page
 * opens in the computer's browser; in a browser, in a new tab, opened before the hub answers so it is
 * not blocked as a pop-up. `done` reloads the list; `link` is set when no tab could be opened.
 * `here` sends the owner back through the app's return page on localhost, for services that allow
 * nothing else.
 */
export class McpSignIn {
  waiting = $state('');
  link = $state('');
  private timer: ReturnType<typeof setInterval> | undefined;

  async start(id: string, signedIn: () => boolean, done: () => Promise<void>, here = false) {
    const desktop = 'crewsteadDesktop' in globalThis;
    const port = here ? await returnPage()?.() : undefined;
    if (typeof port === 'string') throw new Error(port);
    const tab = desktop ? null : window.open('', '_blank');
    this.link = '';
    try {
      const { url } = await mcpServers.signIn(id, port);
      if (desktop) window.open(url, '_blank');
      else if (tab) tab.location.href = url;
      else this.link = url;
    } catch (error) {
      tab?.close();
      throw error;
    }
    this.stop();
    this.waiting = id;
    const started = Date.now();
    this.timer = setInterval(async () => {
      await done();
      if (signedIn() || Date.now() - started > WAIT_MS) this.stop();
    }, POLL_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.waiting = '';
  }
}
