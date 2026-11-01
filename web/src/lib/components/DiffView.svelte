<script lang="ts">
  import '@crewstead/ui/diff.css';
  let { diff }: { diff: string } = $props();
  // File headers are shown by the card; hunks and lines are shown here.
  const lines = $derived(
    diff
      .replace(/\n$/, '')
      .split('\n')
      .filter((line) => !line.startsWith('--- ') && !line.startsWith('+++ ')),
  );
  const kind = (line: string) =>
    line.startsWith('@@')
      ? 'hunk'
      : line.startsWith('+')
        ? 'add'
        : line.startsWith('-')
          ? 'del'
          : '';
</script>

<pre class="diff-view" aria-label="Changes">{#each lines as line, index (index)}<span
      class={kind(line)}>{line}</span
    >{/each}</pre>
