/**
 * A side panel's width, dragged by the owner and remembered on this device. It is set on the page
 * root as a CSS variable, so each panel's styles can leave room for the other (see resize-handle.css).
 */
export class PanelWidth {
  width = $state(0);

  constructor(
    private key: string,
    private cssVariable: string,
    readonly initial: number,
    readonly min: number,
    readonly max: number,
  ) {
    this.width = initial;
  }

  load() {
    try {
      const saved = Number(localStorage.getItem(this.key));
      if (saved) this.width = this.clamp(saved);
    } catch {
      // Without storage the default width applies.
    }
    this.apply();
  }

  private frame = 0;

  /**
   * A new width, applied at most once per frame: a drag reports many moves per frame (a fast mouse
   * up to 1,000 a second), and each applied width lays the whole page out again. `save` remembers
   * it on this device; a drag saves only when it ends.
   */
  set(width: number, save = true) {
    this.width = this.clamp(width);
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.apply();
      });
    if (save) this.save();
  }

  save() {
    try {
      localStorage.setItem(this.key, String(this.width));
    } catch {
      // Kept for this page only.
    }
  }

  private apply() {
    document.documentElement.style.setProperty(this.cssVariable, `${this.width}px`);
  }

  private clamp = (width: number) => Math.round(Math.min(this.max, Math.max(this.min, width)));
}

export const sidebarWidth = new PanelWidth(
  'crewstead-sidebar-width',
  '--sidebar-size',
  256,
  200,
  440,
);
export const chatPanelWidth = new PanelWidth(
  'crewstead-chat-panel-width',
  '--chat-panel-size',
  280,
  240,
  600,
);
