<script lang="ts">
  import NewConversation from '#lib/components/NewConversation.svelte';
  import { page } from '$app/state';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  const workspace = useWorkspace();
</script>

<!-- Starts afresh in another workspace, or when the left panel's + names another project. -->
{#key `${workspace.context} ${page.url.search}`}<NewConversation />{/key}
