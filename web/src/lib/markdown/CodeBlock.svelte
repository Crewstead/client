<script lang="ts">
  import { Check, Copy } from '@lucide/svelte';
  import { copyText } from '#lib/clipboard.ts';
  let { language, text }: { language: string; text: string } = $props();
  let copied = $state(false);
  async function copy() {
    await copyText(text);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<figure class="md-code">
  <figcaption>
    <span>{language || 'text'}</span>
    <button class="md-copy" onclick={copy} aria-label={copied ? 'Copied' : 'Copy code'}>
      {#if copied}<Check size={13} /> Copied{:else}<Copy size={13} /> Copy{/if}
    </button>
  </figcaption>
  <pre><code>{text}</code></pre>
</figure>
