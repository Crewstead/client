<script lang="ts">
  import UsagePage from '#lib/usage/UsagePage.svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  const workspace = useWorkspace();
</script>

{#key workspace.context}<UsagePage />{/key}
