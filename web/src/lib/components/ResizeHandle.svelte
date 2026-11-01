<script lang="ts">
  import '@crewstead/ui/resize-handle.css';
  import type { PanelWidth } from '#lib/panel-widths.svelte.ts';
  let {
    panel,
    edge,
    label,
  }: {
    panel: PanelWidth;
    /** The panel's edge it sits on: dragging past it to the outside makes the panel wider. */
    edge: 'left' | 'right';
    label: string;
  } = $props();
  /** The conversation never gets narrower than this; a panel grows only into the room beyond it. */
  const MAIN_MIN = 440;
  let start: { x: number; width: number; max: number } | undefined;
  /** The widest this panel may be now, leaving the conversation (or page) its minimum. */
  function widest() {
    const main = document.querySelector('.conversation-main') ?? document.querySelector('#main');
    const room = (main?.getBoundingClientRect().width ?? 0) - MAIN_MIN;
    return Math.max(panel.min, panel.width + Math.max(0, room));
  }
  const resize = (width: number, max = widest()) => panel.set(Math.min(width, max));
  let dragging = $state(false);
  const sign = $derived(edge === 'right' ? 1 : -1);
  // While dragging, the whole page shows the resize cursor and selects no text.
  $effect(() => {
    document.body.classList.toggle('panel-resizing', dragging);
    return () => document.body.classList.remove('panel-resizing');
  });
  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    start = { x: event.clientX, width: panel.width, max: widest() };
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (start) resize(start.width + sign * (event.clientX - start.x), start.max);
  }
  function up() {
    start = undefined;
    dragging = false;
  }
  function keydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 40 : 10;
    if (event.key === 'ArrowLeft') resize(panel.width - sign * step);
    else if (event.key === 'ArrowRight') resize(panel.width + sign * step);
    else if (event.key === 'Home') resize(panel.min);
    else if (event.key === 'End') resize(panel.max);
    else return;
    event.preventDefault();
  }
</script>

<!-- Drag to resize, arrows to nudge, double-click for the usual width. -->
<!-- A focusable separator is the ARIA window-splitter pattern, so it takes focus and input. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="resize-handle"
  class:dragging
  data-edge={edge}
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuenow={panel.width}
  aria-valuemin={panel.min}
  aria-valuemax={panel.max}
  tabindex="0"
  title="Drag to resize · double-click to reset"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  ondblclick={() => panel.set(panel.initial)}
  onkeydown={keydown}
></div>
