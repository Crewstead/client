<script lang="ts">
  import { Check, Copy, Play } from '@lucide/svelte';
  import { copyText } from '#lib/clipboard.ts';
  import { useTerminals } from '#lib/terminals/terminals.svelte.ts';
  let { language, text }: { language: string; text: string } = $props();
  const SHELLS = new Set(['bash', 'sh', 'shell', 'zsh', 'fish', 'console', 'powershell', 'ps1']);
  const terminals = useTerminals();
  // Run, in a chat on a computer where the owner may type into terminals.
  const runnable = $derived(
    !!terminals?.typing && SHELLS.has(language.toLowerCase()) && !!text.trim(),
  );
  let copied = $state(false);
  let running = $state(false);
  let failed = $state('');
  async function copy() {
    await copyText(text);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
  async function run() {
    running = true;
    failed = '';
    if (!(await terminals!.open({ cols: 120, rows: 30 }, text.trim())))
      failed = terminals!.error || 'Could not open a terminal.';
    running = false;
  }
</script>

<figure class="md-code">
  <figcaption>
    <span>{language || 'text'}</span>
    <span class="md-code-actions">
      {#if runnable}<button
          class="md-copy"
          class:failed
          onclick={run}
          disabled={running}
          title={failed || 'Run in a terminal under this chat'}
          ><Play size={13} />
          {failed ? 'Failed' : 'Run'}</button
        >{/if}
      <button class="md-copy" onclick={copy} aria-label={copied ? 'Copied' : 'Copy code'}>
        {#if copied}<Check size={13} /> Copied{:else}<Copy size={13} /> Copy{/if}
      </button>
    </span>
  </figcaption>
  <pre><code>{text}</code></pre>
</figure>
