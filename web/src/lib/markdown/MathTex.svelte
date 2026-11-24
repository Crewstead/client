<script lang="ts">
  import { renderMath } from './math.ts';
  /** A LaTeX formula, in the line or on its own; one still streaming, or broken, shows its source. */
  let {
    tex,
    display = false,
    closed = true,
  }: { tex: string; display?: boolean; closed?: boolean } = $props();
  let html = $state<string>();
  $effect(() => {
    const source = tex.trim();
    let current = true;
    if (closed && source)
      void renderMath(source, display).then((markup) => {
        if (current) html = markup;
      });
    return () => (current = false);
  });
</script>

<!-- A span even on its own line: inline `$$…$$` sits inside a paragraph. -->
<span class={display ? 'md-math' : 'md-math-inline'}>
  {#if html}
    <!-- KaTeX markup, rendered with `trust` off. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html html}
  {:else}<code class:md-math-source={display}>{tex.trim()}</code>{/if}
</span>
