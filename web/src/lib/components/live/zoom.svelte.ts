/** How far a live page may be zoomed, and how far a double tap goes. */
const MAX = 5;
const TAP_ZOOM = 2.5;

interface Point {
  x: number;
  y: number;
}

/**
 * Zoom and pan of a live page on its screen, for small screens: two fingers pinch (also while the
 * owner controls the page), one finger moves a zoomed page (only while watching, since then a tap is
 * not a click), a double tap zooms in on a spot or back out; Ctrl+wheel (a touchpad pinch) zooms too.
 * Positions are in the screen's own pixels; the stage is scaled from its top left corner.
 */
export class Zoom {
  scale = $state(1);
  x = $state(0);
  y = $state(0);
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- fingers on the screen, not shown
  private pointers = new Map<number, Point>();
  private start?: { scale: number; x: number; y: number; distance: number; middle: Point };
  private drag?: { from: Point; x: number; y: number };
  private lastTap = 0;

  constructor(
    private box: () => HTMLElement | undefined,
    /** The owner controls the page: one finger clicks there instead of moving the view. */
    private controlling: () => boolean,
  ) {}

  get zoomed() {
    return this.scale > 1.01;
  }

  get transform() {
    return this.zoomed ? `translate(${this.x}px, ${this.y}px) scale(${this.scale})` : undefined;
  }

  reset() {
    this.scale = 1;
    this.x = 0;
    this.y = 0;
  }

  /** Zooms by `factor` around a point of the screen, e.g. the buttons' centre or a pinch. */
  zoomAt(point: Point, factor: number, from = { scale: this.scale, x: this.x, y: this.y }) {
    const scale = Math.min(Math.max(from.scale * factor, 1), MAX);
    const ratio = scale / from.scale;
    this.scale = scale;
    this.x = point.x - (point.x - from.x) * ratio;
    this.y = point.y - (point.y - from.y) * ratio;
    this.keepInside();
  }

  zoomCentre(factor: number) {
    const box = this.box()?.getBoundingClientRect();
    if (box) this.zoomAt({ x: box.width / 2, y: box.height / 2 }, factor);
  }

  private local(event: PointerEvent | WheelEvent): Point {
    const box = this.box()!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  /** The page always covers the screen: no empty edge shows past it. */
  private keepInside() {
    const box = this.box()?.getBoundingClientRect();
    if (!box) return;
    this.x = Math.min(0, Math.max(box.width - box.width * this.scale, this.x));
    this.y = Math.min(0, Math.max(box.height - box.height * this.scale, this.y));
    if (!this.zoomed) this.reset();
  }

  down = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return;
    this.pointers.set(event.pointerId, this.local(event));
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [Point, Point];
      this.start = {
        scale: this.scale,
        x: this.x,
        y: this.y,
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      this.drag = undefined;
      event.preventDefault();
    } else if (this.pointers.size === 1 && !this.controlling()) {
      const now = Date.now();
      const point = this.local(event);
      if (now - this.lastTap < 300) {
        this.lastTap = 0;
        if (this.zoomed) this.reset();
        else this.zoomAt(point, TAP_ZOOM);
        return;
      }
      this.lastTap = now;
      if (this.zoomed) this.drag = { from: point, x: this.x, y: this.y };
    }
  };

  move = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    const point = this.local(event);
    this.pointers.set(event.pointerId, point);
    if (this.start && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [Point, Point];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // Pinching zooms around where it began, and moving both fingers moves the page.
      this.zoomAt(this.start.middle, distance / this.start.distance, this.start);
      this.x += middle.x - this.start.middle.x;
      this.y += middle.y - this.start.middle.y;
      this.keepInside();
      event.preventDefault();
    } else if (this.drag) {
      this.x = this.drag.x + point.x - this.drag.from.x;
      this.y = this.drag.y + point.y - this.drag.from.y;
      this.keepInside();
      event.preventDefault();
    }
  };

  up = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.start = undefined;
    if (!this.pointers.size) this.drag = undefined;
  };

  wheel = (event: WheelEvent) => {
    if (!event.ctrlKey || this.controlling()) return;
    event.preventDefault();
    this.zoomAt(this.local(event), Math.exp(-event.deltaY / 200));
  };
}
