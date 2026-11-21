<script lang="ts">
  import { Check, Code, Copy, Eye, Play } from '@lucide/svelte';
  import { copyText } from '#lib/clipboard.ts';
  import { useTerminals } from '#lib/terminals/terminals.svelte.ts';
  import LiveHtml from './LiveHtml.svelte';
  import MermaidDiagram from './MermaidDiagram.svelte';
  let {
    language,
    text,
    closed = true,
  }: { language: string; text: string; closed?: boolean } = $props();
  const SHELLS = new Set(['bash', 'sh', 'shell', 'zsh', 'fish', 'console', 'powershell', 'ps1']);
  const terminals = useTerminals();
  const kind = $derived(language.toLowerCase());
  // Run, in a chat on a computer where the owner may type into terminals.
  const runnable = $derived(!!terminals?.typing && SHELLS.has(kind) && !!text.trim());
  // A diagram or a page shows once its block is complete (not while it streams in).
  const shown = $derived((kind === 'mermaid' || kind === 'html') && closed && !!text.trim());
  let asCode = $state(false);
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

<figure class="md-code" class:md-shown={shown && !asCode}>
  <figcaption>
    <span>{language || 'text'}</span>
    <span class="md-code-actions">
      {#if shown}<button class="md-copy" onclick={() => (asCode = !asCode)}
          >{#if asCode}<Eye size={13} /> {kind === 'html' ? 'Page' : 'Diagram'}{:else}<Code
              size={13}
            /> Code{/if}</button
        >{/if}
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
  {#if shown && !asCode}{#if kind === 'html'}<LiveHtml html={text} />{:else}<div
        class="md-diagram-box"
      >
        <MermaidDiagram {text} />
      </div>{/if}
  {:else}<pre><code>{text}</code></pre>{/if}
</figure>
