<script lang="ts">
  import { parseBlocks, type Block } from './blocks.ts';
  import CodeBlock from './CodeBlock.svelte';
  import Inline from './Inline.svelte';
  import Self from './Markdown.svelte';
  import '@crewstead/ui/markdown.css';
  /** Either Markdown text, or already parsed blocks (for nested lists and quotes). */
  let { text, blocks: given }: { text?: string; blocks?: Block[] } = $props();
  const blocks = $derived(given ?? parseBlocks(text ?? ''));
</script>

{#each blocks as block, index (index)}
  {#if block.type === 'paragraph'}<p><Inline nodes={block.content} /></p>
  {:else if block.type === 'heading'}<svelte:element this={`h${Math.min(block.level + 2, 6)}`}
      ><Inline nodes={block.content} /></svelte:element
    >
  {:else if block.type === 'code'}<CodeBlock language={block.language} text={block.text} />
  {:else if block.type === 'list'}
    <svelte:element
      this={block.ordered ? 'ol' : 'ul'}
      start={block.ordered ? block.start : undefined}
    >
      {#each block.items as item, itemIndex (itemIndex)}<li><Self blocks={item} /></li>{/each}
    </svelte:element>
  {:else if block.type === 'quote'}<blockquote><Self blocks={block.blocks} /></blockquote>
  {:else if block.type === 'table'}
    <div class="md-table">
      <table>
        <thead
          ><tr
            >{#each block.head as cell, column (column)}<th style:text-align={block.align[column]}
                ><Inline nodes={cell} /></th
              >{/each}</tr
          ></thead
        >
        <tbody>
          {#each block.rows as row, rowIndex (rowIndex)}<tr
              >{#each row as cell, column (column)}<td style:text-align={block.align[column]}
                  ><Inline nodes={cell} /></td
                >{/each}</tr
            >{/each}
        </tbody>
      </table>
    </div>
  {:else if block.type === 'rule'}<hr />{/if}
{/each}
