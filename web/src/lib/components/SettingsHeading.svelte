<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    title,
    page = false,
    children,
    action,
  }: {
    title: string;
    /** The section's own title at the top of its page; otherwise a group inside it. */
    page?: boolean;
    /** What the section or group is for, in one sentence under its title. */
    children?: Snippet;
    /** Its main action, e.g. "Add server", at the right. */
    action?: Snippet;
  } = $props();
</script>

<!-- Every Settings heading: the title, its note under it, the action on the right
     (docs/plan/29-settings-design.md, Page anatomy). -->
<div class="section-heading" class:page-heading={page}>
  <div>
    {#if page}<h2>{title}</h2>{:else}<h3>{title}</h3>{/if}
    {#if children}<p>{@render children()}</p>{/if}
  </div>
  {#if action}<div class="heading-action">{@render action()}</div>{/if}
</div>
