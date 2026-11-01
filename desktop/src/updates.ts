import { app, dialog } from 'electron';
import electronUpdater from 'electron-updater';

const HOURS = 6;

/**
 * Updates from the public releases of Crewstead/client: checked at start and every few hours,
 * downloaded in the background, installed when the app quits (or at once, if the person says so).
 * Linux (AppImage) and Windows only: macOS installs signed updates only, and these are not signed yet.
 */
export function keepUpdated() {
  if (!app.isPackaged || process.platform === 'darwin') return;
  if (process.platform === 'linux' && !process.env.APPIMAGE) return;
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (error) => console.log(`[update] ${error.message.split('\n')[0]}`));
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Crewstead update',
      message: `Crewstead ${info.version} is ready.`,
      detail: 'Restart to use it now, or it installs the next time Crewstead quits.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, HOURS * 3_600_000).unref();
}
