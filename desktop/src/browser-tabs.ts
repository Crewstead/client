import { randomUUID } from 'node:crypto';
import {
  session as sessions,
  WebContentsView,
  type BrowserWindow,
  type Rectangle,
  type WebContents,
  type WebPreferences,
} from 'electron';

/** The browser's one kept profile, apart from the window's own (the hub sign-in). */
export const PARTITION = 'persist:crewstead-browser';
/** A tab's size until it is first shown; the page lays out as on an ordinary screen. */
const HIDDEN = { x: 0, y: 0, width: 1280, height: 800 };
const CAPTURE_MS = 8_000;
/** Spots at least this wide show the page at its own size. */
const WIDE = 960;
/** Chromium's smallest zoom. */
const MIN_ZOOM = 0.25;

const preferences: WebPreferences = {
  partition: PARTITION,
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  // Tabs keep working while they are not on screen, as the model may use one meanwhile.
  backgroundThrottling: false,
};

/**
 * The browser's tabs: views in the app's window, shown over the space the page leaves for them (the
 * Browser panel) and hidden otherwise. The computer service drives them through Chromium's DevTools
 * endpoint; tabs are known to it and to the page by Chromium's target id. Popups become tabs too, so
 * sign-in windows keep their opener. Downloads and device permissions are off.
 */
export class BrowserTabs {
  private tabs = new Map<WebContentsView, Promise<string>>();

  constructor(private window: BrowserWindow) {
    const session = sessions.fromPartition(PARTITION);
    session.on('will-download', (event) => event.preventDefault());
    session.setPermissionRequestHandler((_contents, _permission, done) => done(false));
    session.setPermissionCheckHandler(() => false);
  }

  /** Opens a blank tab; resolves the unique address it shows, by which the service finds it. */
  open() {
    const address = `about:blank#crewstead-${randomUUID()}`;
    void this.add(new WebContentsView({ webPreferences: preferences })).webContents.loadURL(
      address,
    );
    return address;
  }

  /**
   * Shows a tab over `bounds` (the window's content coordinates) and hides the others. A narrow spot
   * (the side panel) shows the page scaled down, so it keeps its desktop layout for the owner and the
   * model alike; a hidden tab goes back to a screen's size.
   */
  async show(target: string | undefined, bounds?: Rectangle) {
    const view = target ? await this.find(target) : undefined;
    for (const other of this.tabs.keys())
      if (other !== view && other.getVisible()) {
        other.setVisible(false);
        other.webContents.setZoomFactor(1);
        other.setBounds(HIDDEN);
      }
    if (!view || !bounds) return false;
    const zoom = bounds.width >= WIDE ? 1 : Math.max(MIN_ZOOM, bounds.width / HIDDEN.width);
    view.webContents.setZoomFactor(zoom);
    view.setBounds(round(bounds));
    view.setVisible(true);
    return true;
  }

  /** A JPEG of a tab, or of part of it. Needs the window on screen where windows hidden do not draw. */
  async capture(target: string, quality: number, clip?: Rectangle) {
    const view = await this.find(target);
    if (!view) throw new Error('This tab is not open any more.');
    const image = await Promise.race([
      view.webContents.capturePage(clip && round(clip), { stayHidden: true, stayAwake: true }),
      new Promise<undefined>((resolve) => setTimeout(resolve, CAPTURE_MS)),
    ]);
    if (!image || image.isEmpty())
      throw new Error(
        'The page could not be drawn: open the Crewstead window on that computer, then try again.',
      );
    return image.toJPEG(quality);
  }

  private add(view: WebContentsView) {
    const contents = view.webContents;
    view.setVisible(false);
    view.setBounds(HIDDEN);
    this.window.contentView.addChildView(view);
    this.tabs.set(view, targetOf(view));
    contents.setWindowOpenHandler(({ url }) =>
      /^https?:/.test(url)
        ? {
            action: 'allow',
            // The popup is a tab of its own, made from the opener's own options so it stays linked.
            createWindow: (options) =>
              this.add(
                new WebContentsView({
                  // Electron passes the popup's own contents along with the options.
                  webContents: (options as { webContents?: WebContents }).webContents,
                  webPreferences: { ...options.webPreferences, ...preferences },
                }),
              ).webContents,
          }
        : { action: 'deny' },
    );
    contents.once('destroyed', () => {
      this.tabs.delete(view);
      if (!this.window.isDestroyed()) this.window.contentView.removeChildView(view);
    });
    return view;
  }

  private async find(target: string) {
    for (const [view, id] of this.tabs)
      if ((await id.catch(() => undefined)) === target) return view;
    return undefined;
  }
}

/** Chromium's id for the tab's page, which the service sees too. */
async function targetOf(view: WebContentsView) {
  const debug = view.webContents.debugger;
  debug.attach('1.3');
  try {
    const { targetInfo } = (await debug.sendCommand('Target.getTargetInfo')) as {
      targetInfo: { targetId: string };
    };
    return targetInfo.targetId;
  } finally {
    debug.detach();
  }
}

const round = (box: Rectangle): Rectangle => ({
  x: Math.round(box.x),
  y: Math.round(box.y),
  width: Math.max(1, Math.round(box.width)),
  height: Math.max(1, Math.round(box.height)),
});
