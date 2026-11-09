<script lang="ts">
  import type { Snippet } from 'svelte';
  let { text, action }: { text: string; action?: Snippet } = $props();
</script>

<!-- The one empty state in Settings: a dashed card, one sentence, and what fills it when there is one. -->
<div class="settings-empty">
  <p>{text}</p>
  {#if action}{@render action()}{/if}
</div>
