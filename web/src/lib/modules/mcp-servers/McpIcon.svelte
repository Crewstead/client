<script lang="ts">
  import type { CatalogEntry } from './catalog/index.ts';
  let { entry, name, size = 20 }: { entry?: CatalogEntry; name: string; size?: number } = $props();
  /** Very dark brand colours vanish on the dark theme: those follow the text colour. */
  const fill = $derived.by(() => {
    const hex = entry?.icon?.hex;
    if (!hex) return 'currentColor';
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
    return 0.299 * r! + 0.587 * g! + 0.114 * b! < 60 ? 'currentColor' : `#${hex}`;
  });
</script>

{#if entry?.icon}<svg
    class="mcp-icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    {fill}><path d={entry.icon.path} /></svg
  >{:else}<span class="mcp-icon mcp-letter" style:--size={`${size}px`} aria-hidden="true"
    >{(entry?.name ?? name).slice(0, 1).toUpperCase()}</span
  >{/if}
