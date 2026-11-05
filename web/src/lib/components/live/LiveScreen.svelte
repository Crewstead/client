<script lang="ts">
  import { Keyboard, LoaderCircle } from '@lucide/svelte';
  import type { LiveEvent, LiveInput } from '@crewstead/core/protocol';
  import LiveControl from './LiveControl.svelte';
  import { apiUrl, withAccount } from '#lib/auth/connection.ts';
  import { canEmbed, embedTab } from '#lib/desktop/browser-panel.ts';
  let {
    base,
    sessionKey,
    tab,
    onpage,
    onclosed,
    control = false,
    send,
  }: {
    base: string;
    sessionKey: string;
    /** The tab to show; the session's current one when missing. */
    tab?: string | undefined;
    /** The watcher took control: their clicks, scrolling and keys go to the page. */
    control?: boolean;
    send: (input: LiveInput) => void;
    /** The session's address and title as they change. */
    onpage: (page: Extract<LiveEvent, { type: 'page' }>) => void;
    onclosed: () => void;
  } = $props();
  /** The page's viewport size, known from the first frame; frames are drawn on the canvas. */
  let frame = $state<{ width: number; height: number }>();
  let canvas = $state<HTMLCanvasElement>();
  // Each frame is decoded off screen and drawn over the last one only when ready, so nothing blinks;
  // a frame that arrives while one is decoding replaces it.
  let decoding = false;
  let waiting: { data: string; at?: number } | undefined;
  /** How far behind the browser the last drawn frame was, in milliseconds (shown on hover). */
  let behind = $state(0);
  async function draw(data: string, at?: number) {
    if (decoding) return void (waiting = { data, at });
    decoding = true;
    try {
      // The browser decodes the JPEG itself, off the main thread.
      const blob = await (await fetch(`data:image/jpeg;base64,${data}`)).blob();
      const bitmap = await createImageBitmap(blob);
      if (canvas) {
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
        }
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
        if (at) behind = Date.now() - at;
      }
      bitmap.close();
    } catch {
      // A frame that does not decode is skipped; the next one replaces it.
    } finally {
      decoding = false;
      const next = waiting;
      waiting = undefined;
      if (next) void draw(next.data, next.at);
    }
  }
  let cursor = $state<{ x: number; y: number; kind: 'click' | 'type'; seq: number }>();
  let failed = $state(false);
  // In the desktop app, a browser of this computer is the app's own: its real tab lies over this
  // spot, and no pictures are streamed. Undefined while the app is asked.
  let screen = $state<HTMLDivElement>();
  let embedded = $state<boolean | undefined>(canEmbed() ? undefined : false);
  $effect(() => {
    if (!screen || embedded === false) return;
    return embedTab(screen, sessionKey, tab, (on) => (embedded = embedded ?? on));
  });
  $effect(() => {
    if (embedded !== false) return;
    const source = new EventSource(
      withAccount(
        apiUrl(`${base}/${encodeURIComponent(sessionKey)}/stream${tab ? `?tab=${tab}` : ''}`),
      ),
      { withCredentials: true },
    );
    let seq = 0;
    frame = undefined;
    cursor = undefined;
    failed = false;
    source.addEventListener('live', (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as LiveEvent;
      if (event.type === 'frame') {
        const width = event.width || 1280;
        const height = event.height || 800;
        if (frame?.width !== width || frame?.height !== height) frame = { width, height };
        void draw(event.data, event.at);
      } else if (event.type === 'cursor') cursor = { ...event, seq: ++seq };
      else if (event.type === 'page') onpage(event);
      else {
        source.close();
        onclosed();
      }
    });
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) failed = true;
    };
    return () => source.close();
  });
</script>

<!-- The page as the model sees it, with a cursor that glides to where it clicks or types. -->
<div
  bind:this={screen}
  class="live-screen"
  class:controlled={control}
  class:embedded
  style:aspect-ratio={frame ? `${frame.width} / ${frame.height}` : '16 / 10'}
  style:--page-ratio={frame ? frame.width / frame.height : 1.6}
  role="region"
  aria-label="Live view of the browser"
  data-behind={behind}
>
  <canvas bind:this={canvas} class:hidden={!frame}></canvas>
  {#if !frame && !embedded}<p class="live-waiting">
      {#if failed}This browser is not available.{:else}<LoaderCircle size={18} class="spin" /> Connecting
        to the browser…{/if}
    </p>{/if}
  {#if frame && cursor}
    <span
      class="live-cursor"
      data-kind={cursor.kind}
      style:left={`${(cursor.x / frame.width) * 100}%`}
      style:top={`${(cursor.y / frame.height) * 100}%`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"
        ><path
          d="M4 2.5 19.5 13l-6.6 1.2 3.9 7.3-2.7 1.4-3.9-7.3L5.3 20Z"
          fill="#fff"
          stroke="#111"
          stroke-width="1.4"
          stroke-linejoin="round"
        /></svg
      >
      {#key cursor.seq}<span class="live-ripple"></span>{/key}
      {#if cursor.kind === 'type'}<span class="live-typing"><Keyboard size={11} /> typing</span
        >{/if}
    </span>
  {/if}
  {#if frame && control}<LiveControl width={frame.width} height={frame.height} {send} />{/if}
</div>
