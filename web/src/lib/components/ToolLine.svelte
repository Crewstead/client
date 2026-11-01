<script lang="ts">
  import { ChevronRight } from '@lucide/svelte';
  import type { TimelineItem } from '@crewstead/core/protocol';
  import { metaFor } from './tool-meta.ts';
  import { commandSummary } from './tool-result.ts';
  import Attachments from './attachments/Attachments.svelte';
  let { item }: { item: TimelineItem } = $props();
  const meta = $derived(metaFor(item.toolName));
  const Icon = $derived(meta.icon);
  // A finished command says how it went: "Exit code 0 · 4 lines of output".
  const ran = $derived(
    meta.kind === 'command' && item.status === 'completed' && item.result?.startsWith('Exit code')
      ? commandSummary(item.result)
      : undefined,
  );
  const status = $derived(
    ran
      ? ran.line
          .replace('Exit code ', 'Exit ')
          .replace(/ of output$/, '')
          .replace('no output', 'no output')
      : item.status === 'pending'
        ? item.review?.outcome === 'checking'
          ? 'Checking'
          : 'Running'
        : item.status === 'completed'
          ? item.autoApproved
            ? 'approved automatically'
            : item.review?.outcome === 'approved'
              ? 'approved by review'
              : ''
          : item.review?.outcome === 'declined'
            ? 'declined by review'
            : item.status,
  );
  const review = $derived(
    item.review && item.review.outcome !== 'checking' ? item.review : undefined,
  );
</script>

<!-- Reading, listing and searching need no approval; they show as one line that opens to the result. -->
<details class="tool-line" data-status={item.status}>
  <summary
    ><ChevronRight size={13} class="tool-line-chevron" /><Icon size={14} /><span
      class="tool-line-text">{item.text}</span
    >{#if status}<span class="tool-status" class:failed={ran?.failed}>{status}</span>{/if}</summary
  >
  {#if review}<p class="tool-line-review">
      Auto-review {review.outcome}{review.risk ? ` · ${review.risk} risk` : ''}: {review.rationale}
    </p>{/if}
  {#if item.result && review?.outcome !== 'declined'}<pre
      class="tool-output">{item.result}</pre>{/if}
</details>
<!-- A running command's output shows as it comes. -->
{#if item.status === 'pending' && item.progress}<pre
    class="tool-output live tool-line-live"
    aria-label="Output so far">{item.progress}</pre>{/if}
<!-- A screenshot stays in view: it is what the agent looked at. -->
{#if item.attachments?.length}<div class="tool-line-files">
    <Attachments files={item.attachments} />
  </div>{/if}
