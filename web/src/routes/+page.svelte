<script lang="ts">
  import NewConversation from '#lib/components/NewConversation.svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  const workspace = useWorkspace();
</script>

{#key workspace.context}<NewConversation />{/key}
