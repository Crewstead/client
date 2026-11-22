const MAX = 8;

/**
 * Zoom for the picture viewer: the wheel and a pinch zoom toward the pointer, a double click zooms in
 * there or back out, and a drag pans. The picture keeps its fitted size in the page and is scaled over
 * it, so the viewer never changes size; it never moves out of its frame.
 */
export class ImageZoom {
  scale = $state(1);
  x = $state(0);
  y = $state(0);
  readonly transform = $derived(`translate(${this.x}px, ${this.y}px) scale(${this.scale})`);
  private width = 0;
  private height = 0;

  /** Scales by `factor` keeping the point (`px`, `py`) of the frame where it is. */
  zoomAt(factor: number, px: number, py: number) {
    const scale = Math.min(MAX, Math.max(1, this.scale * factor));
    const ratio = scale / this.scale;
    this.x = px - (px - this.x) * ratio;
    this.y = py - (py - this.y) * ratio;
    this.scale = scale;
    this.keepInFrame();
  }

  /** From the buttons and keys: toward the middle. */
  zoomBy(factor: number) {
    this.zoomAt(factor, this.width / 2, this.height / 2);
  }

  reset() {
    this.scale = 1;
    this.x = 0;
    this.y = 0;
  }

  private keepInFrame() {
    this.x = Math.min(0, Math.max(this.width - this.width * this.scale, this.x));
    this.y = Math.min(0, Math.max(this.height - this.height * this.scale, this.y));
  }

  /** On the frame around the picture. */
  attach = (frame: HTMLElement) => {
    const measure = new ResizeObserver(() => {
      this.width = frame.clientWidth;
      this.height = frame.clientHeight;
      this.keepInFrame();
    });
    measure.observe(frame);
    const at = (event: { clientX: number; clientY: number }) => {
      const box = frame.getBoundingClientRect();
      return [event.clientX - box.left, event.clientY - box.top] as const;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      this.zoomAt(Math.exp(-event.deltaY * 0.0015), ...at(event));
    };
    const double = (event: MouseEvent) => {
      if (this.scale > 1) this.reset();
      else this.zoomAt(2.5, ...at(event));
    };
    // One pointer pans; two pinch.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never shown
    const pointers = new Map<number, { x: number; y: number }>();
    let spread = 0;
    const down = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      frame.setPointerCapture(event.pointerId);
      if (pointers.size === 2) spread = distance();
    };
    const distance = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const move = (event: PointerEvent) => {
      const last = pointers.get(event.pointerId);
      if (!last) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const now = distance();
        const [a, b] = [...pointers.values()];
        if (spread && now)
          this.zoomAt(
            now / spread,
            ...at({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 }),
          );
        spread = now;
      } else if (this.scale > 1) {
        this.x += event.clientX - last.x;
        this.y += event.clientY - last.y;
        this.keepInFrame();
      }
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      spread = 0;
    };
    frame.addEventListener('wheel', wheel, { passive: false });
    frame.addEventListener('dblclick', double);
    frame.addEventListener('pointerdown', down);
    frame.addEventListener('pointermove', move);
    frame.addEventListener('pointerup', up);
    frame.addEventListener('pointercancel', up);
    return () => {
      measure.disconnect();
      frame.removeEventListener('wheel', wheel);
      frame.removeEventListener('dblclick', double);
      frame.removeEventListener('pointerdown', down);
      frame.removeEventListener('pointermove', move);
      frame.removeEventListener('pointerup', up);
      frame.removeEventListener('pointercancel', up);
    };
  };
}
