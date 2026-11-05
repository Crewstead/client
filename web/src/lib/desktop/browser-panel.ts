/** The desktop app's Browser panel bridge (desktop/src/preload.cts), absent in an ordinary browser. */
interface PanelBridge {
  show(
    key: string,
    bounds: { x: number; y: number; width: number; height: number },
    tab?: string,
  ): Promise<boolean>;
  hide(): Promise<void>;
}

const bridge = () =>
  (globalThis as { crewsteadDesktop?: { browserPanel?: PanelBridge } }).crewsteadDesktop
    ?.browserPanel;

/** Whether this window is the desktop app, which can show its own browser's tabs in place. */
export const canEmbed = () => !!bridge();

/** How often the place is checked again, as the model may switch to another tab meanwhile. */
const RECHECK_MS = 1_500;

/**
 * Keeps the app's tab of a browser (`key`, its `tab` or the current one) over `node` while it is
 * mounted: the app lays the real page on that spot. `shown` hears whether the app has that browser
 * (false: it is on another computer, and the page shows the stream instead). The tab steps aside
 * while a dialog is open over the page, since it would cover it.
 */
export function embedTab(
  node: HTMLElement,
  key: string,
  tab: string | undefined,
  shown: (on: boolean) => void,
) {
  const panel = bridge();
  if (!panel) return () => {};
  let stopped = false;
  let busy = false;
  let again = false;
  async function place() {
    if (stopped) return;
    if (busy) return void (again = true);
    busy = true;
    try {
      const box = node.getBoundingClientRect();
      const covered = !!document.querySelector('dialog[open]');
      if (covered || box.width < 2 || box.height < 2) await panel!.hide();
      else {
        const on = await panel!.show(
          key,
          { x: box.left, y: box.top, width: box.width, height: box.height },
          tab,
        );
        if (!stopped) shown(on);
      }
    } finally {
      busy = false;
      if (again) {
        again = false;
        void place();
      }
    }
  }
  const resize = new ResizeObserver(() => void place());
  resize.observe(node);
  const dialogs = new MutationObserver(() => void place());
  dialogs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  const moved = () => void place();
  addEventListener('resize', moved);
  addEventListener('scroll', moved, true);
  const timer = setInterval(moved, RECHECK_MS);
  void place();
  return () => {
    stopped = true;
    resize.disconnect();
    dialogs.disconnect();
    removeEventListener('resize', moved);
    removeEventListener('scroll', moved, true);
    clearInterval(timer);
    void panel.hide();
  };
}
