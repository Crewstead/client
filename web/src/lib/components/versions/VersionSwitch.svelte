<script lang="ts">
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';
  import type { ChatActions, Versions } from './chat-actions.ts';
  let { versions, actions }: { versions: Versions; actions: ChatActions } = $props();
  const go = (step: number) => actions.version(versions.anchor, versions.active + step);
</script>

<!-- Other versions of the chat from this prompt on, made by retrying or editing it. -->
<span class="version-switch" role="group" aria-label="Versions">
  <button
    class="icon-button"
    aria-label="Previous version"
    disabled={actions.disabled || versions.active === 0}
    onclick={() => go(-1)}><ChevronLeft size={14} /></button
  >
  <span>{versions.active + 1} / {versions.count}</span>
  <button
    class="icon-button"
    aria-label="Next version"
    disabled={actions.disabled || versions.active === versions.count - 1}
    onclick={() => go(1)}><ChevronRight size={14} /></button
  >
</span>
