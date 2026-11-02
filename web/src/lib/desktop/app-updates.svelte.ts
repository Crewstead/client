/** What the desktop app says about its updates (desktop/src/updates.ts). */
export interface AppUpdateState {
  version: string;
  supported: boolean;
  checking: boolean;
  downloading?: string;
  ready?: string;
  latest?: boolean;
  error?: string;
}

interface UpdatesBridge {
  state(): Promise<AppUpdateState | undefined>;
  check(): Promise<AppUpdateState | undefined>;
  restart(): Promise<void>;
  onChange(listener: (state: AppUpdateState) => void): () => void;
}

/** The desktop app's bridge, absent in an ordinary browser. */
const bridge = () =>
  (globalThis as { crewsteadDesktop?: { updates?: UpdatesBridge } }).crewsteadDesktop?.updates;

/**
 * The desktop app's updates, followed while the page is open: the window offers the restart once
 * a new version is downloaded, and Settings shows the version and checks on request.
 */
class AppUpdates {
  state = $state<AppUpdateState>();
  /** The restart was put off until the next new version (or the next start). */
  dismissed = $state<string>();
  private started = false;

  /** Starts following; nothing happens outside the desktop app. */
  follow() {
    const updates = bridge();
    if (this.started || !updates) return;
    this.started = true;
    void updates.state().then((state) => (this.state = state));
    updates.onChange((state) => (this.state = state));
  }
  get available() {
    return !!bridge();
  }
  async check() {
    const state = await bridge()?.check();
    if (state) this.state = state;
  }
  restart() {
    void bridge()?.restart();
  }
}

export const appUpdates = new AppUpdates();
