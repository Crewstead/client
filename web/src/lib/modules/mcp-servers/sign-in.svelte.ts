import { mcpServers } from './api.ts';

const POLL_MS = 2_000;
const WAIT_MS = 5 * 60_000;

/**
 * Opens a server's sign-in page and watches for the sign-in to land. In the Crewstead app the page
 * opens in the computer's browser; in a browser, in a new tab, opened before the hub answers so it is
 * not blocked as a pop-up. `done` reloads the list; `link` is set when no tab could be opened.
 */
export class McpSignIn {
  waiting = $state('');
  link = $state('');
  private timer: ReturnType<typeof setInterval> | undefined;

  async start(id: string, signedIn: () => boolean, done: () => Promise<void>) {
    const desktop = 'crewsteadDesktop' in globalThis;
    const tab = desktop ? null : window.open('', '_blank');
    this.link = '';
    try {
      const { url } = await mcpServers.signIn(id);
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
