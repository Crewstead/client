<script lang="ts">
  let { html }: { html: string } = $props();
  const CDNS = 'https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com';
  /**
   * The page runs in a sandbox with no origin (nothing of the hub's is reachable) and may load only
   * scripts and styles from a few public CDNs. Its own CSP comes first, so the page cannot loosen it.
   */
  const policy =
    `default-src 'none'; script-src 'unsafe-inline' ${CDNS}; style-src 'unsafe-inline' ${CDNS} ` +
    'https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: blob:; ' +
    'media-src data: blob:';
  /** Written apart, so this component's own script does not end here. */
  const END_SCRIPT = '<' + '/script>';
  // Tells the chat its height, and lets a form put text in the message box: crewstead.compose(text).
  const bridge = `<script>(() => {
  const post = (message) => parent.postMessage({ crewstead: true, ...message }, '*');
  const size = () => {
    const body = document.body;
    if (!body) return;
    const style = getComputedStyle(body);
    const height = body.scrollHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    post({ kind: 'size', height: Math.ceil(height) });
  };
  addEventListener('DOMContentLoaded', () => new ResizeObserver(size).observe(document.body));
  addEventListener('load', size);
  window.crewstead = { compose: (text) => post({ kind: 'compose', text: String(text) }) };
})();${END_SCRIPT}`;
  const base =
    '<style>:root{color-scheme:dark}body{margin:12px;font:14px/1.5 system-ui,sans-serif;' +
    'color:#e6e6eb;background:transparent}</style>';
  const page = $derived(
    `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}">` +
      `${base}${bridge}${html}`,
  );
  let frame = $state<HTMLIFrameElement>();
  let height = $state(160);
  function heard(event: MessageEvent) {
    if (!frame || event.source !== frame.contentWindow || !event.data?.crewstead) return;
    if (event.data.kind === 'size' && typeof event.data.height === 'number')
      height = Math.min(Math.max(event.data.height, 40), 1_200);
    else if (event.data.kind === 'compose' && typeof event.data.text === 'string')
      // The owner sends it themselves, from the message box.
      window.dispatchEvent(
        new CustomEvent('crewstead:compose', { detail: event.data.text.slice(0, 20_000) }),
      );
  }
</script>

<svelte:window onmessage={heard} />
<iframe
  bind:this={frame}
  class="md-live-html"
  title="Page from the reply"
  sandbox="allow-scripts allow-forms"
  srcdoc={page}
  style:height={`${height}px`}
></iframe>
