<script lang="ts">
  let { text }: { text: string } = $props();
  let count = 0;
  /** mermaid loads only when a reply has a diagram; it is large. */
  async function draw(source: string) {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'dark',
      // Plain SVG text, so the drawing works as a picture.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });
    const { svg } = await mermaid.render(`mermaid-${Date.now()}-${count++}`, source);
    // Its own size (the drawing says width 100%, which would blow a small diagram up).
    const width = Number(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+)/.exec(svg)?.[1]) || undefined;
    return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width };
  }
  const drawn = $derived(draw(text));
</script>

<!-- Shown as a picture: nothing in it can run. -->
{#await drawn}<div class="md-diagram-wait">Drawing…</div>
{:then { url, width }}<img class="md-diagram" src={url} {width} alt="Diagram" />
{:catch error}<p class="md-diagram-error">
    This diagram could not be drawn: {error?.message?.split('\n')[0] ?? 'unknown error'}
  </p>
  <pre><code>{text}</code></pre>{/await}
