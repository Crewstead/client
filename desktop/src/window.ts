import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';

/**
 * The app's one window. It shows the app's own interface at the hub's address (local-interface.ts)
 * and nothing else: other sites open in the browser, page code gets no access to this computer (no Node, sandboxed, isolated context).
 */
export function createWindow(icon: string) {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 380,
    minHeight: 480,
    show: false,
    icon,
    backgroundColor: '#191a1f',
    title: 'Crewstead',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  // No menu bar in the window (Alt would show it, and Alt with the arrow keys moves projects);
  // its shortcuts that matter stay. macOS keeps its menu at the top of the screen.
  if (process.platform !== 'darwin') {
    window.removeMenu();
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !(input.control || input.meta)) {
        if (input.type === 'keyDown' && input.key === 'F5') window.webContents.reload();
        return;
      }
      const page = window.webContents;
      const zoom = page.getZoomLevel();
      const key = input.key.toLowerCase();
      if (key === 'r') page.reload();
      else if (key === '=' || key === '+') page.setZoomLevel(Math.min(zoom + 0.5, 5));
      else if (key === '-') page.setZoomLevel(Math.max(zoom - 0.5, -3));
      else if (key === '0') page.setZoomLevel(0);
      else if (key === 'i' && input.shift && !app.isPackaged) page.toggleDevTools();
      else return;
      event.preventDefault();
    });
  }
  window.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) window.show();
  });
  return window;
}

/** Keeps the window on `origin` (and the app's own setup page); everything else opens outside. */
export function stayOn(window: BrowserWindow, origin: () => string | undefined) {
  const allowed = (url: string) => {
    if (url.startsWith('file:')) return true;
    try {
      return new URL(url).origin === origin();
    } catch {
      return false;
    }
  };
  const external = (url: string) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (allowed(url)) return;
    event.preventDefault();
    external(url);
  });
  // No camera, microphone, location or other device access for page code.
  window.webContents.session.setPermissionRequestHandler((_contents, permission, done) =>
    done(permission === 'notifications' || permission === 'clipboard-sanitized-write'),
  );
}
