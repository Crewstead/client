import { app, dialog } from 'electron';
import electronUpdater from 'electron-updater';

const HOURS = 6;

/**
 * Updates from the public releases of Crewstead/client: checked at start and every few hours,
 * downloaded in the background, installed when the app quits (or at once, if the person says so).
 * Linux (AppImage) and Windows only: macOS installs signed updates only, and these are not signed yet.
 */
const supported = () =>
  app.isPackaged &&
  process.platform !== 'darwin' &&
  (process.platform !== 'linux' || !!process.env.APPIMAGE);

/** The version downloaded and waiting for a restart, if any. */
let ready: string | undefined;

async function offerRestart(version: string) {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    title: 'Crewstead update',
    message: `Crewstead ${version} is ready.`,
    detail: 'Restart to use it now, or it installs the next time Crewstead quits.',
  });
  if (response === 0) electronUpdater.autoUpdater.quitAndInstall();
}

export function keepUpdated() {
  if (!supported()) return;
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (error) => console.log(`[update] ${error.message.split('\n')[0]}`));
  autoUpdater.on('update-downloaded', (info) => {
    ready = info.version;
    void offerRestart(info.version);
  });
  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, HOURS * 3_600_000).unref();
}

/** "Check for updates…" in the tray: says what it found instead of working silently. */
export async function checkNow() {
  const tell = (message: string, detail?: string) =>
    dialog.showMessageBox({ type: 'info', title: 'Crewstead update', message, detail });
  if (!supported())
    return tell(
      `This is Crewstead ${app.getVersion()}.`,
      'Updates install themselves in the Linux AppImage and on Windows. Here, download the newest ' +
        'version from github.com/Crewstead/client/releases.',
    );
  if (ready) return offerRestart(ready);
  try {
    const result = await electronUpdater.autoUpdater.checkForUpdates();
    const latest = result?.updateInfo.version;
    if (!result?.isUpdateAvailable || !latest)
      return tell(`Crewstead ${app.getVersion()} is the newest version.`);
    return tell(
      `Crewstead ${latest} is downloading.`,
      'You will be asked to restart once it is ready.',
    );
  } catch (error) {
    return tell(
      'Could not check for updates.',
      (error as Error).message.split('\n')[0] ?? 'Try again later.',
    );
  }
}
