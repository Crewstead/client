<script lang="ts">
  import { onMount } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { apiUrl, withAccount } from '../auth/connection.ts';
  import { request } from '../api';
  import '@xterm/xterm/css/xterm.css';
  let {
    id,
    typing,
    ended = $bindable(),
  }: {
    id: string;
    /** Typing reaches the program; without it the terminal only shows what it prints. */
    typing: boolean;
    /** Why it ended, once it has. */
    ended?: string;
  } = $props();
  let box: HTMLDivElement;

  onMount(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, 'SFMono-Regular', Consolas, monospace",
      fontSize: 13,
      scrollback: 5_000,
      theme: { background: '#16171c', foreground: '#eeeef3', cursor: '#eeeef3' },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(box);
    fit.fit();

    // What the owner types goes in order, gathered while the previous part is on its way.
    let typed = '';
    let sending = false;
    const send = async () => {
      if (sending || !typed) return;
      sending = true;
      const data = typed;
      typed = '';
      await request(`/terminals/${id}/input`, {
        method: 'POST',
        body: JSON.stringify({ data }),
      }).catch(() => undefined);
      sending = false;
      void send();
    };
    const typedIn = terminal.onData((data) => {
      if (!typing || ended) return;
      typed += data;
      void send();
    });

    // Its size follows the drawer; the program hears the new size shortly after.
    let sized = '';
    let resizing: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      fit.fit();
      const size = `${terminal.cols}x${terminal.rows}`;
      if (size === sized || ended) return;
      sized = size;
      clearTimeout(resizing);
      resizing = setTimeout(() => {
        void request(`/terminals/${id}/resize`, {
          method: 'POST',
          body: JSON.stringify({ cols: terminal.cols, rows: terminal.rows }),
        }).catch(() => undefined);
      }, 150);
    });
    observer.observe(box);

    // Each connection starts with what it printed so far, so a reconnect starts afresh.
    const source = new EventSource(withAccount(apiUrl(`/terminals/${id}/stream`)), {
      withCredentials: true,
    });
    source.onopen = () => terminal.reset();
    source.addEventListener('data', (event) =>
      terminal.write((JSON.parse((event as MessageEvent).data) as { data: string }).data),
    );
    source.addEventListener('end', (event) => {
      ended = (JSON.parse((event as MessageEvent).data) as { reason: string }).reason;
      terminal.write(`\r\n\x1b[2m[${ended}]\x1b[0m\r\n`);
      source.close();
    });
    terminal.focus();
    return () => {
      source.close();
      observer.disconnect();
      clearTimeout(resizing);
      typedIn.dispose();
      terminal.dispose();
    };
  });
</script>

<div class="terminal-view" bind:this={box} data-terminal={id}></div>
