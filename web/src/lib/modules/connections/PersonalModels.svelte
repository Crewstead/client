<script lang="ts">
  import type { SlotProps } from '../types.ts';
  import ProviderGroups from './ProviderGroups.svelte';
  let { note }: SlotProps['personal-models'] = $props();
</script>

<ProviderGroups context="personal" title="Personal models" {note} />
