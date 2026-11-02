import { app, dialog } from 'electron';
import electronUpdater from 'electron-updater';

const HOURS = 6;

/** What the app's window and tray show about updates. */
export interface UpdateState {
  version: string;
  /** This build updates itself (the Linux AppImage and Windows). */
  supported: boolean;
  checking: boolean;
  /** A newer version is downloading. */
  downloading?: string;
  /** A newer version is downloaded and installs on restart. */
  ready?: string;
  /** The last check found nothing newer. */
  latest?: boolean;
  error?: string;
}

const supported = () =>
  app.isPackaged &&
  process.platform !== 'darwin' &&
  (process.platform !== 'linux' || !!process.env.APPIMAGE);

let state: UpdateState = { version: app.getVersion(), supported: false, checking: false };
const listeners = new Set<(state: UpdateState) => void>();
function set(change: Partial<UpdateState>) {
  state = { ...state, ...change };
  for (const listener of listeners) listener(state);
}
export const updateState = () => state;
/** Calls `listener` with every change, e.g. to tell the window and refresh the tray. */
export const onUpdateState = (listener: (state: UpdateState) => void) => listeners.add(listener);

/**
 * Updates from the public releases of Crewstead/client: checked at start and every few hours,
 * downloaded in the background, installed on restart or when the app quits. The app's window
 * offers the restart. Linux (AppImage) and Windows only: macOS installs signed updates only, and
 * these are not signed yet.
 */
export function keepUpdated() {
  set({ supported: supported() });
  if (!state.supported) return;
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ checking: true, error: undefined }));
  autoUpdater.on('update-not-available', () => set({ checking: false, latest: true }));
  autoUpdater.on('update-available', (info) =>
    set({ checking: false, latest: false, downloading: info.version }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    set({ downloading: undefined, ready: info.version }),
  );
  autoUpdater.on('error', (error) => {
    const message = error.message.split('\n')[0] ?? 'Could not check for updates.';
    console.log(`[update] ${message}`);
    set({ checking: false, downloading: undefined, error: message });
  });
  void check();
  setInterval(() => void check(), HOURS * 3_600_000).unref();
}

/** Checks now; the state says what it found. */
export async function check() {
  if (!state.supported || state.ready || state.checking) return state;
  await electronUpdater.autoUpdater.checkForUpdates().catch(() => undefined);
  return state;
}

export function restartToUpdate() {
  if (state.ready) electronUpdater.autoUpdater.quitAndInstall();
}

/** "Check for updates…" in the tray: says what it found instead of working silently. */
export async function checkNow() {
  const tell = (message: string, detail?: string) =>
    dialog.showMessageBox({ type: 'info', title: 'Crewstead update', message, detail });
  if (!state.supported)
    return tell(
      `This is Crewstead ${state.version}.`,
      'Updates install themselves in the Linux AppImage and on Windows. Here, download the newest ' +
        'version from github.com/Crewstead/client/releases.',
    );
  const found = await check();
  if (found.ready) {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Crewstead update',
      message: `Crewstead ${found.ready} is ready.`,
      detail: 'Restart to use it now, or it installs the next time Crewstead quits.',
    });
    if (response === 0) restartToUpdate();
    return;
  }
  if (found.error) return tell('Could not check for updates.', found.error);
  if (found.downloading)
    return tell(
      `Crewstead ${found.downloading} is downloading.`,
      'Crewstead offers a restart once it is ready.',
    );
  return tell(`Crewstead ${state.version} is the newest version.`);
}
