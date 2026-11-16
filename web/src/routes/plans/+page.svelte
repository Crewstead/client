<script lang="ts">
  import { page } from '$app/state';
  import ModuleSlot from '#lib/modules/ModuleSlot.svelte';
  const project = $derived(page.url.searchParams.get('project') ?? '');
  const plan = $derived(page.url.searchParams.get('plan') ?? '');
</script>

<!-- A project's plans, from the planning module (absent when it is off). -->
{#key `${project}|${plan}`}<ModuleSlot
    slot="plan-page"
    props={{ project, ...(plan ? { plan } : {}) }}
  />{/key}
