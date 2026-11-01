<script lang="ts">
  import { Check, Copy } from '@lucide/svelte';
  import { copyText } from './chat-actions.ts';
  let { text, label }: { text: string; label: string } = $props();
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function copy() {
    await copyText(text);
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1_500);
  }
</script>

<button
  class="icon-button"
  aria-label={copied ? 'Copied' : label}
  title={copied ? 'Copied' : label}
  onclick={copy}
>
  {#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}
</button>
