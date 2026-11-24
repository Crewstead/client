<script lang="ts">
  import type { Snippet } from 'svelte';
  import Dropdown from './Dropdown.svelte';
  import '@crewstead/ui/header-popover.css';
  let {
    label,
    heading,
    title,
    button,
    children: content,
    open = $bindable(false),
    wide = false,
  }: {
    /** The button's name, with its state ("Skills, 2 on"), for screen readers and its tooltip. */
    label: string;
    /** The panel's name, what it is ("Skills in this chat"). */
    heading: string;
    title?: string;
    /** The button's face: an icon, and a short value beside it. */
    button: Snippet;
    children: Snippet;
    open?: boolean;
    /** Room for rows with several actions (scheduled tasks). */
    wide?: boolean;
  } = $props();
</script>

<!-- A chat header's button with its own small panel underneath (a sheet on phones). -->
<Dropdown
  class="header-popover"
  triggerClass="icon-button header-tool"
  panelClass="header-popover-panel {wide ? 'wide' : ''}"
  align="end"
  role="dialog"
  panelLabel={heading}
  {label}
  {...title ? { title } : {}}
  trigger={button}
  children={content}
  bind:open
/>
