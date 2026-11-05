<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    title,
    children,
    action,
  }: {
    title: string;
    /** What the section is for, under its title. */
    children?: Snippet;
    /** Its main action, e.g. "Add server", at the top right. */
    action?: Snippet;
  } = $props();
</script>

<!-- One heading for every settings section, so switching tabs never moves the title or its note. -->
<div class="section-heading">
  <div>
    <h2>{title}</h2>
    {#if children}<p class="muted-text">{@render children()}</p>{/if}
  </div>
  {@render action?.()}
</div>
