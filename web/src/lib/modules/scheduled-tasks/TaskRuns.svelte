<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import Markdown from '#lib/markdown/Markdown.svelte';
  import ToolItem from '#lib/components/ToolItem.svelte';
  import { isReportCall, type ScheduledRun, type ScheduledTask } from '@crewstead/core/protocol';
  import { shortTime, tasks } from './api.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/scheduled-tasks.css';
  let { task, close }: { task: ScheduledTask; close: () => void } = $props();
  const id = $props.id();
  const OUTCOMES: Record<ScheduledRun['outcome'], string> = {
    posted: 'Posted in the chat',
    quiet: 'Not posted',
    failed: 'Failed',
    stopped: 'Stopped',
  };
  let runs = $state<ScheduledRun[]>();
  let error = $state('');
  $effect(() => {
    tasks.runs(task.id).then(
      (found) => (runs = found),
      (cause) => (error = cause instanceof Error ? cause.message : 'Could not load the runs.'),
    );
  });
  // Past runs are only read here: nothing waits for an answer.
  const decide = async () => false;
</script>

<dialog
  {@attach closeOutside}
  class="dialog-content task-dialog task-runs-dialog"
  aria-labelledby={`${id}-title`}
  {@attach (node) => node.showModal()}
  onclose={close}
>
  <h2 id={`${id}-title`} class="dialog-title">{task.title}: runs</h2>
  <p class="dialog-description">
    Every run is kept here. A run is also posted in the chat when its model found something to
    report.
  </p>
  {#if error}<p class="error-banner" role="alert">{error}</p>
  {:else if !runs}<p class="task-zone">Loading…</p>
  {:else if !runs.length}<p class="task-zone">No runs yet.</p>
  {:else}
    <ul class="task-runs" aria-label="Runs">
      {#each runs as run (run.id)}
        <li>
          <details class="task-run">
            <summary
              ><span>{shortTime(run.ranAt)}</span><span class="pill" data-outcome={run.outcome}
                >{OUTCOMES[run.outcome]}</span
              ></summary
            >
            <div class="task-run-items">
              {#each run.items.filter((item) => !isReportCall(item)) as item (item.id)}
                {#if item.role === 'tool'}<div class="tool-row"><ToolItem {item} {decide} /></div>
                {:else if item.role === 'assistant' && item.text}<div class="markdown">
                    <Markdown text={item.text} />
                  </div>{/if}
              {:else}<p class="task-zone">Nothing was written.</p>
              {/each}
            </div>
          </details>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="dialog-actions">
    <button
      type="button"
      class="button subtle"
      onclick={(event) => event.currentTarget.closest('dialog')?.close()}>Close</button
    >
  </div>
</dialog>
