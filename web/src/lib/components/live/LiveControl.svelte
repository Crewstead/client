<script lang="ts">
  import { liveKeys, type LiveInput } from '@crewstead/core/protocol';
  let {
    width,
    height,
    send,
  }: {
    /** The page's viewport, in CSS pixels; positions are scaled to it. */
    width: number;
    height: number;
    send: (input: LiveInput) => void;
  } = $props();
  let layer: HTMLDivElement;
  const keys = new Set<string>(liveKeys);
  function at(event: MouseEvent) {
    const box = layer.getBoundingClientRect();
    return {
      x: Math.round(((event.clientX - box.left) / box.width) * width),
      y: Math.round(((event.clientY - box.top) / box.height) * height),
    };
  }
  // Typing goes out in short runs, scrolling in small steps, both in the order they happened.
  let text = '';
  let textTimer: ReturnType<typeof setTimeout> | undefined;
  const flushText = () => {
    clearTimeout(textTimer);
    textTimer = undefined;
    if (text) send({ type: 'text', text });
    text = '';
  };
  let wheel = { dx: 0, dy: 0, x: 0, y: 0 };
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;
  function scroll(event: WheelEvent) {
    event.preventDefault();
    wheel = { ...at(event), dx: wheel.dx + event.deltaX, dy: wheel.dy + event.deltaY };
    wheelTimer ??= setTimeout(() => {
      wheelTimer = undefined;
      flushText();
      send({ type: 'wheel', ...wheel });
      wheel = { dx: 0, dy: 0, x: 0, y: 0 };
    }, 80);
  }
  function click(event: MouseEvent, button: 'left' | 'right') {
    event.preventDefault();
    layer.focus();
    flushText();
    send({ type: 'click', ...at(event), button, count: Math.min(Math.max(event.detail, 1), 3) });
  }
  function keydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    const command = event.ctrlKey || event.metaKey;
    const named = command
      ? `ControlOrMeta+${event.key.toLowerCase()}`
      : event.shiftKey && event.key === 'Tab'
        ? 'Shift+Tab'
        : event.key;
    if (keys.has(named)) {
      event.preventDefault();
      flushText();
      send({ type: 'key', key: named as (typeof liveKeys)[number] });
    } else if (event.key.length === 1 && !command && !event.altKey) {
      event.preventDefault();
      text += event.key;
      textTimer ??= setTimeout(flushText, 120);
    }
  }
  function paste(event: ClipboardEvent) {
    const pasted = event.clipboardData?.getData('text/plain');
    if (!pasted) return;
    event.preventDefault();
    flushText();
    send({ type: 'text', text: pasted.slice(0, 2_000) });
  }
</script>

<!-- While in control, clicks, scrolling and keys here go to the page. It is an application surface
     (raw pointer and keyboard input for a remote page), which Svelte's checks do not count as interactive. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="live-control"
  bind:this={layer}
  role="application"
  aria-label="Browser page, under your control"
  tabindex="0"
  {@attach (node) => node.focus()}
  onclick={(event) => click(event, 'left')}
  oncontextmenu={(event) => click(event, 'right')}
  {@attach (node) => {
    // Scrolling here must not scroll the app, so the listener cannot be passive.
    node.addEventListener('wheel', scroll, { passive: false });
    return () => node.removeEventListener('wheel', scroll);
  }}
  onkeydown={keydown}
  onpaste={paste}
></div>
