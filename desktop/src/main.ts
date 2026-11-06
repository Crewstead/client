import { app, dialog, ipcMain, type BrowserWindow, type Rectangle } from 'electron';
import { join } from 'node:path';
import { computerSettings } from '../../daemon/src/computer.ts';
import { machineHome, readConfig } from '../../daemon/src/config.ts';
import { setAutostart } from './autostart.ts';
import { addToLauncher } from './launcher.ts';
import { terminalPath } from './shell-path.ts';
import {
  check,
  checkNow,
  keepUpdated,
  onUpdateState,
  restartToUpdate,
  updateState,
} from './updates.ts';
import { Computer } from './computer.ts';
import { hubOrigin, readSettings, writeSettings } from './settings.ts';
import { serveInterface } from './local-interface.ts';
import { createTray } from './tray.ts';
import { createWindow, stayOn } from './window.ts';
import { BrowserTabs } from './browser-tabs.ts';
import { SiteData } from './site-data/index.ts';
import { openReturn, PORT } from './oauth-return.ts';

// One app per person: a second start shows the first one's window.
if (!app.requestSingleInstanceLock()) app.quit();
// The browser's tabs (browser-tabs.ts) are driven by this computer's service through Chromium's
// DevTools endpoint: on this computer only, at a port Chromium picks and names in a file in the app's
// folder. Tabs not on screen keep working meanwhile.
app.commandLine.appendSwitch('remote-debugging-port', '0');
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
for (const name of [
  'disable-renderer-backgrounding',
  'disable-backgrounding-occluded-windows',
  'disable-background-timer-throttling',
])
  app.commandLine.appendSwitch(name);

const assets = join(__dirname, '..', 'assets');
const icon = join(assets, 'icon.png');
const trayIcon = join(assets, 'tray.png');
let window: BrowserWindow;
let tabs: BrowserTabs | undefined;
let quitting = false;
let asked = false;
// The page hears when this computer connects, so it shows it online at once.
const computer = new Computer(
  () => {
    refreshTray();
    if (window && !window.isDestroyed()) window.webContents.send('computer-state', computer.state);
  },
  // The service's browser tools open and draw tabs here.
  async (op, args) => {
    if (!tabs) throw new Error('The Crewstead window is not ready yet.');
    if (op === 'browser-open') return tabs.open();
    if (op === 'browser-capture') {
      const { target, quality, clip } = args as {
        target: string;
        quality: number;
        clip?: Rectangle;
      };
      return (await tabs.capture(target, quality, clip)).toString('base64');
    }
    throw new Error(`Unknown request: ${op}`);
  },
);
let tray: ReturnType<typeof createTray> | undefined;
let reach: ReturnType<typeof serveInterface> | undefined;

const hub = () => readSettings().hub;
function refreshTray() {
  tray?.update(
    updateState().ready,
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

/**
 * Adds a project on this computer from the folder its owner picks in the system's dialog. Asked by
 * the hub's Settings page; only the hub this computer is connected to may ask.
 */
ipcMain.handle('add-project', async (event) => {
  const address = hub();
  const from = event.senderFrame?.url;
  if (!address || !from || new URL(from).origin !== address) return 'Not allowed.';
  if (computer.connectedHub() !== address || computer.state === 'removed')
    return 'Let chats use this computer first (Crewstead asks when you sign in).';
  const picked = await dialog.showOpenDialog(window, {
    title: 'Add a project folder',
    buttonLabel: 'Add project',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (picked.canceled || !picked.filePaths[0]) return 'cancelled';
  try {
    await computer.command(['add', picked.filePaths[0]]);
    return '';
  } catch (error) {
    return (error as Error).message.split('\n').at(-1) || 'Could not add that folder.';
  }
});

// Updates, for the hub's pages in this window: what is known, a check now, and the restart.
const fromHub = (event: Electron.IpcMainInvokeEvent) => {
  const address = hub();
  const from = event.senderFrame?.url;
  return !!address && !!from && from.startsWith('http') && new URL(from).origin === address;
};
// An MCP sign-in through this computer: the return page the service sends the owner's browser to.
ipcMain.handle('oauth-return', async (event) => {
  const address = hub();
  if (!fromHub(event) || !address) return 'Not allowed.';
  try {
    return await openReturn(address);
  } catch {
    return `Port ${PORT} on this computer is taken by another program.`;
  }
});
ipcMain.handle('hub-state', (event) => (fromHub(event) ? reach?.state() : undefined));
ipcMain.handle('update-state', (event) => (fromHub(event) ? updateState() : undefined));
ipcMain.handle('update-check', (event) => (fromHub(event) ? check() : undefined));
ipcMain.handle('update-restart', (event) => {
  if (fromHub(event)) restartToUpdate();
});

// Whole-computer settings of this computer, from its own window: turning them on happens at the
// computer, and this app is there. The page asks which computer this is, to offer it on its row.
ipcMain.handle('this-computer', (event) =>
  fromHub(event) && computer.connectedHub() === hub()
    ? readConfig(machineHome())?.machineId
    : undefined,
);
ipcMain.handle('computer-setting', async (event, key: unknown, on: unknown) => {
  if (!fromHub(event) || typeof on !== 'boolean') return 'Not allowed.';
  if (key !== 'enabled' && key !== 'commands' && key !== 'browser' && key !== 'terminals')
    return 'Not allowed.';
  const value = on ? 'on' : 'off';
  try {
    if (key === 'terminals') await computer.command(['terminal', value]);
    else await computer.command(['computer', ...(key === 'enabled' ? [value] : [key, value])]);
    refreshTray();
    return '';
  } catch (error) {
    return (error as Error).message.split('\n').at(-1) || 'That did not work.';
  }
});

// The Browser panel: the page leaves room for a chat's browser and asks for it there. The service says
// which tab is that browser's current one, when the browser is on this computer.
ipcMain.handle('browser-show', async (event, key: unknown, bounds: unknown, tab: unknown) => {
  if (!fromHub(event) || typeof key !== 'string' || !tabs) return false;
  const box = bounds as Rectangle;
  if (![box?.x, box?.y, box?.width, box?.height].every((value) => Number.isFinite(value)))
    return false;
  // The hub names a browser "<computer>:<key on that computer>"; only this computer's are here.
  const here = readConfig(machineHome())?.machineId;
  if (!here || !key.startsWith(`${here}:`)) return false;
  const which = { key: key.slice(here.length + 1), tab: typeof tab === 'string' ? tab : undefined };
  const target = await computer.ask('browser-current', which).catch(() => undefined);
  // The page measures in its own pixels; the window lays views out in its, which zoom changes.
  const zoom = window.webContents.getZoomFactor();
  const scaled = {
    x: box.x * zoom,
    y: box.y * zoom,
    width: box.width * zoom,
    height: box.height * zoom,
  };
  return tabs.show(typeof target === 'string' ? target : undefined, scaled);
});
ipcMain.handle('browser-hide', (event) => {
  if (fromHub(event)) void tabs?.show(undefined);
});

// Settings → Browser: the browser's sites, and importing chosen sites' sign-ins from another
// browser here (site-data/). Answers stay in this window; an import asks its owner first.
const siteData = new SiteData(() => window);
ipcMain.handle('site-data', async (event, op: unknown, args: unknown) => {
  if (!fromHub(event)) throw new Error('Not allowed.');
  const { site, source, sites } = (args ?? {}) as {
    site?: unknown;
    source?: unknown;
    sites?: unknown;
  };
  if (op === 'kept') return siteData.kept();
  if (op === 'remove' && typeof site === 'string') return siteData.remove(site);
  if (op === 'sources') return siteData.sources();
  if (op === 'sites' && typeof source === 'string') return siteData.sites(source);
  if (op === 'import' && typeof source === 'string' && Array.isArray(sites))
    return siteData.import(
      source,
      sites.filter((entry) => typeof entry === 'string'),
    );
  throw new Error('Not allowed.');
});

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
  tabs = new BrowserTabs(window);
  // The interface is this app's own; only the API goes to the hub. The page hears when it cannot.
  reach = serveInterface(window.webContents.session, hub, (state) => {
    if (!window.isDestroyed()) window.webContents.send('hub-state', state);
  });
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
    checkUpdates: () => void checkNow(),
    quit: () => app.quit(),
  });
  setAutostart(readSettings().autostart !== false);
  addToLauncher(join(assets, 'icon-256.png'));
  openHub();
  // Only a connection made for this app's hub; a computer connected elsewhere is asked first.
  // After any service an earlier run left behind has stopped: one computer, one link to the hub.
  if (computer.connectedHub() === hub())
    void computer.stopLeftovers().then(() => computer.state === 'off' && computer.start());
  refreshTray();
  // The window and tray hear of every change: a bar in the window offers the restart.
  onUpdateState((state) => {
    window.webContents.send('update-state', state);
    refreshTray();
  });
  keepUpdated();
});
app.on('second-instance', show);
app.on('activate', () => window && show());
app.on('before-quit', () => {
  quitting = true;
  computer.stop();
});
// The tray keeps the app alive without windows (all platforms).
app.on('window-all-closed', () => undefined);
