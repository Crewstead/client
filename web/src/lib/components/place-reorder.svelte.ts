/**
 * Rearranging the left panel's places by dragging a row's handle (mouse or touch) or with the arrow
 * keys on it. While dragging, `live` is the order shown; letting go saves it.
 */
export class PlaceReorder {
  live = $state<string[] | null>(null);
  moving = $state('');

  constructor(private save: (ids: string[]) => void) {}

  /** Starts a drag of `id` among `ids` (in the order shown); rows are `data-place` elements in `list`. */
  start(event: PointerEvent, id: string, ids: string[], list: HTMLElement) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const before = ids.join();
    this.live = [...ids];
    this.moving = id;
    // Where each row sits now, before anything moves: rows animate aside while dragging, so their
    // live positions would lag behind. The dragged place goes to the slot nearest the pointer.
    const slots = [...list.querySelectorAll<HTMLElement>('[data-place]')].map((row) => {
      const box = row.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    const move = (next: PointerEvent) => {
      let index = 0;
      slots.forEach((middle, at) => {
        if (Math.abs(next.clientY - middle) < Math.abs(next.clientY - slots[index]!)) index = at;
      });
      const order = ids.filter((place) => place !== id);
      order.splice(index, 0, id);
      if (order.join() !== this.live?.join()) this.live = order;
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      const order = this.live;
      this.live = null;
      this.moving = '';
      if (order && order.join() !== before) this.save(order);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** Arrow keys on a handle move its place one step. */
  key(event: KeyboardEvent, id: string, ids: string[]) {
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
