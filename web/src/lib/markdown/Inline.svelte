<script lang="ts">
  import type { Inline } from './inline.ts';
  import Self from './Inline.svelte';
  let { nodes }: { nodes: Inline[] } = $props();
</script>

{#each nodes as node, index (index)}{#if node.type === 'text'}{node.text}{:else if node.type === 'break'}<br
    />{:else if node.type === 'code'}<code>{node.text}</code
    >{:else if node.type === 'strong'}<strong><Self nodes={node.children} /></strong
    >{:else if node.type === 'em'}<em><Self nodes={node.children} /></em
    >{:else if node.type === 'del'}<del><Self nodes={node.children} /></del
    >{:else if node.type === 'link'}<!-- safeHref allows only http, https and mailto. --><!-- eslint-disable-next-line svelte/no-navigation-without-resolve --><a
      href={node.href}
      target="_blank"
      rel="noopener noreferrer nofollow"><Self nodes={node.children} /></a
    >{/if}{/each}
