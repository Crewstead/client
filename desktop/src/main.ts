import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { computerSettings } from '../../daemon/src/computer.ts';
import { machineHome } from '../../daemon/src/config.ts';
import { setAutostart } from './autostart.ts';
import { terminalPath } from './shell-path.ts';
import { Computer } from './computer.ts';
import { hubOrigin, readSettings, writeSettings } from './settings.ts';
import { createTray } from './tray.ts';
import { createWindow, stayOn } from './window.ts';

// One app per person: a second start shows the first one's window.
if (!app.requestSingleInstanceLock()) app.quit();

const assets = join(__dirname, '..', 'assets');
const icon = join(assets, 'icon.png');
const trayIcon = join(assets, 'tray.png');
let window: BrowserWindow;
let quitting = false;
let asked = false;
const computer = new Computer(() => refreshTray());
let tray: ReturnType<typeof createTray> | undefined;

const hub = () => readSettings().hub;
function refreshTray() {
  tray?.update(
    computer.state,
    readSettings().autostart !== false,
    computerSettings(machineHome()).enabled,
  );
}
function show() {
  window.show();
  window.focus();
}
function openHub() {
  const address = hub();
  if (address) void window.loadURL(address);
  else void window.loadFile(join(assets, 'setup.html'));
}

/**
 * Asks once, after the owner signed in, whether chats may use this computer; yes registers it with
 * the hub as that account and starts the service. Asked again only from the tray.
 */
async function offerComputer(force = false) {
  const address = hub();
  if (!address || (asked && !force)) return;
  if (computer.connectedHub() === address && computer.state !== 'removed') return;
  if (!force && readSettings().declined === address) return;
  const signedIn = await window.webContents.session.fetch(`${address}/api/auth/session`);
  if (!signedIn.ok) return;
  asked = true;
  const other = computer.connectedHub();
  const { response } = await dialog.showMessageBox(window, {
    type: 'question',
    buttons: ['Allow', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    title: 'Use this computer',
    message: 'Let chats use this computer?',
    detail:
      `Chats on ${new URL(address).host} could then work in folders you allow here and use Claude ` +
      'Code signed in on this computer. They ask before changing anything.' +
      (other && other !== address ? `\n\nThis computer now works for ${other}; that ends.` : ''),
  });
  if (response !== 0) {
    writeSettings({ declined: address });
    return;
  }
  writeSettings({ declined: undefined });
  try {
    await computer.connect(address);
  } catch (error) {
    dialog.showErrorBox('Could not connect this computer', String((error as Error).message));
  }
}

async function allowFolder() {
  const picked = await dialog.showOpenDialog(window, {
    title: 'Allow a folder for projects',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (picked.canceled || !picked.filePaths[0]) return;
  try {
    await computer.command(['allow', picked.filePaths[0]]);
  } catch (error) {
    dialog.showErrorBox('Could not allow that folder', String((error as Error).message));
  }
}

// The first-run page's address; accepted from that page only, never from a hub page.
ipcMain.handle('connect-hub', async (event, input: string) => {
  if (!event.senderFrame?.url.startsWith('file:')) return 'Not allowed.';
  try {
    const origin = hubOrigin(String(input));
    const health = await fetch(`${origin}/api/health`).catch(() => undefined);
    if (!health?.ok) return `No Crewstead hub answers at ${origin}.`;
    writeSettings({ hub: origin, declined: undefined });
    asked = false;
    openHub();
    return '';
  } catch (error) {
    return (error as Error).message;
  }
});

void app.whenReady().then(() => {
  // The computer service runs Claude Code and project commands as a terminal would find them.
  process.env.PATH = terminalPath();
  window = createWindow(icon);
  stayOn(window, hub);
  // Closing the window keeps the app (and this computer's service) running in the tray.
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });
  // After a load, and after the web app signs in, which only changes its route.
  window.webContents.on('did-finish-load', () => void offerComputer());
  window.webContents.on('did-navigate-in-page', () => void offerComputer());
  tray = createTray(trayIcon, {
    show,
    useComputer: () => void offerComputer(true),
    allowFolder: () => void allowFolder(),
    wholeComputer: (on) =>
      void computer.command(['computer', on ? 'on' : 'off']).then(refreshTray, refreshTray),
    autostart: (on) => {
      writeSettings({ autostart: on });
      setAutostart(on);
    },
    changeHub: () => {
      writeSettings({ hub: undefined });
      openHub();
      show();
    },
    quit: () => app.quit(),
  });
  setAutostart(readSettings().autostart !== false);
  openHub();
  // Only a connection made for this app's hub; a computer connected elsewhere is asked first.
  if (computer.connectedHub() === hub()) computer.start();
  refreshTray();
});
app.on('second-instance', show);
app.on('activate', () => window && show());
app.on('before-quit', () => {
  quitting = true;
  computer.stop();
});
// The tray keeps the app alive without windows (all platforms).
app.on('window-all-closed', () => undefined);
