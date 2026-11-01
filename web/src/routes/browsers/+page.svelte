<script lang="ts">
  import BrowserViewer from '#lib/components/live/BrowserViewer.svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  const workspace = useWorkspace();
</script>

{#key workspace.context}<BrowserViewer />{/key}
