/** How far a mouse moves before a press on a row becomes a drag rather than a click. */
const MOUSE_SLOP = 5;
/** How long a finger rests on a row before it picks the row up; moving sooner scrolls the list. */
const HOLD_MS = 350;
const TOUCH_SLOP = 8;

/**
 * Rearranging the left panel's places by dragging the whole row: with a mouse once it moves a little
 * (a plain click still opens the place), on a touch screen after holding it (a swipe still scrolls).
 * Alt with the arrow keys moves the focused row. While dragging, `live` is the order shown.
 */
export class PlaceReorder {
  live = $state<string[] | null>(null);
  moving = $state('');

  constructor(private save: (ids: string[]) => void) {}

  /** A press on `id`'s row among `ids` (in the order shown); rows are `data-place` elements in `list`. */
  press(event: PointerEvent, id: string, ids: string[], list: HTMLElement) {
    if (event.button !== 0 || this.moving) return;
    const pointer = event.pointerId;
    const touch = event.pointerType !== 'mouse';
    const from = { x: event.clientX, y: event.clientY };
    let slots: number[] = [];
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const begin = () => {
      started = true;
      this.live = [...ids];
      this.moving = id;
      // Where each row sits now, before anything moves: rows animate aside while dragging, so their
      // live positions would lag behind. The dragged place goes to the slot nearest the pointer.
      slots = [...list.querySelectorAll<HTMLElement>('[data-place]')].map((place) => {
        const box = place.getBoundingClientRect();
        return box.top + box.height / 2;
      });
      if (touch) navigator.vibrate?.(10);
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointer) return;
      if (!started) {
        const far = Math.hypot(next.clientX - from.x, next.clientY - from.y);
        if (touch) {
          if (far > TOUCH_SLOP) end(next);
        } else if (far > MOUSE_SLOP) begin();
        if (!started) return;
      }
      let index = 0;
      slots.forEach((middle, at) => {
        if (Math.abs(next.clientY - middle) < Math.abs(next.clientY - slots[index]!)) index = at;
      });
      const order = ids.filter((place) => place !== id);
      order.splice(index, 0, id);
      if (order.join() !== this.live?.join()) this.live = order;
    };
    // Once a finger has picked the row up, it moves the row instead of scrolling the list.
    const hold = (next: TouchEvent) => {
      if (started) next.preventDefault();
    };
    const quiet = (next: Event) => {
      next.preventDefault();
      next.stopImmediatePropagation();
    };
    const end = (next?: PointerEvent) => {
      if (next && next.pointerId !== pointer) return;
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('touchmove', hold);
      window.removeEventListener('contextmenu', quiet);
      if (!started) return;
      // The release that ends a drag is not a click on the row.
      window.addEventListener('click', quiet, { capture: true });
      setTimeout(() => window.removeEventListener('click', quiet, { capture: true }));
      const order = this.live;
      this.live = null;
      this.moving = '';
      if (order && order.join() !== ids.join()) this.save(order);
    };
    // Followed on the whole window: the rows move in the page while dragging, and a moved row loses
    // the pointer (its capture ends), so its own events would stop before the drag does.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    if (touch) {
      window.addEventListener('touchmove', hold, { passive: false });
      window.addEventListener('contextmenu', quiet);
      timer = setTimeout(begin, HOLD_MS);
    }
  }

  /** Alt with the up or down arrow moves the focused place one step. */
  key(event: KeyboardEvent, id: string, ids: string[]) {
    if (!event.altKey) return;
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    const at = ids.indexOf(id);
    const to = at + step;
    if (at < 0 || to < 0 || to >= ids.length) return;
    const order = [...ids];
    order.splice(at, 1);
    order.splice(to, 0, id);
    this.save(order);
  }
}
