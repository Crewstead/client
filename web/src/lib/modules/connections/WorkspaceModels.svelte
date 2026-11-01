<script lang="ts">
  import type { SlotProps } from '../types.ts';
  import ProviderGroups from './ProviderGroups.svelte';
  let { context, name, canManage }: SlotProps['workspace'] = $props();
</script>

<ProviderGroups
  {context}
  title="Organisation models"
  note={`Shared providers billed to ${name}. Only admins can connect or change them.`}
  {canManage}
/>
