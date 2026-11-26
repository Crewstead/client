<script module lang="ts">
  type Drawing = { url: string; width?: number };
  /** Diagrams drawn lately, by their source: one drawn again (scrolled back to, reopened) shows at once. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read as a diagram mounts, never shown
  const drawings = new Map<string, Drawing>();
  const KEEP = 40;
  let count = 0;
  /** mermaid loads only when a reply has a diagram; it is large. */
  async function draw(source: string): Promise<Drawing> {
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
    const drawing = { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width };
    drawings.set(source, drawing);
    if (drawings.size > KEEP) drawings.delete(drawings.keys().next().value!);
    return drawing;
  }
</script>

<script lang="ts">
  let { text }: { text: string } = $props();
  // The text itself, not the parsed block it came in: the chat parses a message again on every
  // change to it, and the diagram is drawn again only when its own text changed.
  const source = $derived(text);
  const ready = $derived(drawings.get(source));
  const drawn = $derived(ready ? undefined : draw(source));
</script>

{#snippet picture({ url, width }: Drawing)}<img
    class="md-diagram"
    src={url}
    {width}
    alt="Diagram"
  />{/snippet}

<!-- Shown as a picture: nothing in it can run. -->
{#if ready}{@render picture(ready)}
{:else}{#await drawn}<div class="md-diagram-wait">Drawing…</div>
  {:then drawing}{#if drawing}{@render picture(drawing)}{/if}
  {:catch error}<p class="md-diagram-error">
      This diagram could not be drawn: {error?.message?.split('\n')[0] ?? 'unknown error'}
    </p>
    <pre><code>{source}</code></pre>{/await}{/if}
