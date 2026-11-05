<script lang="ts">
  import type { ContextParts } from '@crewstead/core/protocol';
  import { compact, percent } from './chat-stats.ts';
  import '@crewstead/ui/context-breakdown.css';
  /** Same share the hub summarizes a chat at. */
  const SUMMARY_SHARE = 0.8;
  let {
    parts,
    used,
    window: size,
  }: { parts?: ContextParts; used: number; window: number } = $props();
  const rows = $derived.by(() => {
    if (!parts) return [];
    return [
      {
        key: 'instructions',
        label: 'Crewstead’s instructions',
        tokens: parts.instructions,
        count: 1,
      },
      {
        key: 'tools',
        label: `Tools · ${parts.toolCount}${parts.mcpTools ? `, ${parts.mcpTools} from MCP` : ''}`,
        tokens: parts.tools,
        count: parts.toolCount,
      },
      { key: 'notes', label: 'Place, skills and notes', tokens: parts.notes, count: 0 },
      { key: 'summary', label: 'Summary of the earlier chat', tokens: parts.summary, count: 0 },
      {
        key: 'messages',
        label: `Messages · ${parts.messageCount}`,
        tokens: parts.messages,
        count: parts.messageCount,
      },
      {
        key: 'results',
        label: `Tool calls and results · ${parts.toolResultCount}`,
        tokens: parts.toolResults,
        count: parts.toolResultCount,
      },
      {
        key: 'files',
        label: `Files · ${parts.fileCount}`,
        tokens: parts.files,
        count: parts.fileCount,
      },
    ].filter((row) => row.tokens > 0 || row.count > 0);
  });
  const free = $derived(Math.max(size - used, 0));
  const width = (tokens: number) => `${Math.min((tokens / size) * 100, 100)}%`;
</script>

<!-- What fills the context, like a disk-usage bar: each part in its colour, then what is left. -->
<section class="context-breakdown" aria-label="What fills the context">
  <p class="context-summary">
    <strong>{compact(used)}</strong> of {compact(size)} used
    <span
      >· {percent(used, size)} · summarizes itself at {compact(
        Math.round(size * SUMMARY_SHARE),
      )}</span
    >
  </p>
  <div class="context-stack" aria-hidden="true">
    {#if rows.length}
      {#each rows as row (row.key)}<i data-part={row.key} style:width={width(row.tokens)}
        ></i>{/each}
    {:else}<i data-part="messages" style:width={width(used)}></i>{/if}
    <b style:left={`${SUMMARY_SHARE * 100}%`}></b>
  </div>
  {#if rows.length}
    <!-- Parts beside the largest pieces, so the panel stays short. -->
    <div class="context-columns">
      <ul class="context-parts">
        {#each rows as row (row.key)}
          <li>
            <span class="context-swatch" data-part={row.key}></span>
            <span class="context-label">{row.label}</span>
            <span class="context-share">{percent(row.tokens, size)}</span>
            <span class="context-tokens">{compact(row.tokens)}</span>
          </li>
        {/each}
        <li class="context-free">
          <span class="context-swatch"></span>
          <span class="context-label">Free</span>
          <span class="context-share">{percent(free, size)}</span>
          <span class="context-tokens">{compact(free)}</span>
        </li>
      </ul>
      {#if parts?.largest.length}
        <div>
          <p class="context-largest-title">Largest pieces</p>
          <ol class="context-largest">
            {#each parts.largest as piece, index (index)}
              <li><span>{piece.label}</span><span>{compact(piece.tokens)}</span></li>
            {/each}
          </ol>
        </div>
      {/if}
    </div>
    <p class="stats-note">
      Parts are estimated from their text and scaled to the {compact(used)} tokens the provider counted.
      Send /compact to summarize the chat now.
    </p>
  {:else}
    <p class="stats-note">The breakdown shows after the next reply.</p>
  {/if}
</section>
