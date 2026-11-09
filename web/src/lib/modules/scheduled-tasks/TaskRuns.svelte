<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import { ChevronRight } from '@lucide/svelte';
  import Markdown from '#lib/markdown/Markdown.svelte';
  import ToolItem from '#lib/components/ToolItem.svelte';
  import LoadingRows from '#lib/components/LoadingRows.svelte';
  import { isReportCall, type ScheduledRun, type ScheduledTask } from '@crewstead/core/protocol';
  import { tasks } from './api.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/scheduled-tasks.css';
  import '@crewstead/ui/settings-page.css';
  import '@crewstead/ui/providers.css';
  let { task, close }: { task: ScheduledTask; close: () => void } = $props();
  const id = $props.id();
  const OUTCOMES: Record<ScheduledRun['outcome'], { label: string; dot: string }> = {
    posted: { label: 'Posted in the chat', dot: 'online' },
    quiet: { label: 'Not posted', dot: '' },
    failed: { label: 'Failed', dot: 'failed' },
    stopped: { label: 'Stopped', dot: 'warning' },
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
  const when = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const shown = (run: ScheduledRun) => run.items.filter((item) => !isReportCall(item));
  /** The reply's first line, so a run can be told apart without opening it. */
  const preview = (run: ScheduledRun) =>
    run.items
      .findLast((item) => item.role === 'assistant' && item.text.trim())
      ?.text.replace(/[#*_`>]/g, '')
      .trim()
      .split('\n')[0] ?? '';
</script>

<dialog
  {@attach closeOutside}
  class="dialog-content task-runs-dialog"
  aria-labelledby={`${id}-title`}
  aria-describedby={`${id}-description`}
  {@attach (node) => node.showModal()}
  onclose={close}
>
  <h2 id={`${id}-title`} class="dialog-title">Runs of “{task.title}”</h2>
  <p id={`${id}-description`} class="dialog-description">
    Every run is kept here, newest first. A run is posted in the chat only when it has something to
    tell you.
  </p>
  {#if error}<p class="error-banner" role="alert">{error}</p>
  {:else if !runs}<div class="settings-card"><LoadingRows label="Loading runs" rows={3} /></div>
  {:else if !runs.length}<div class="settings-empty"><p>No runs yet.</p></div>
  {:else}
    <ul class="task-runs" aria-label="Runs">
      {#each runs as run (run.id)}
        <li>
          <details class="task-run">
            <summary>
              <ChevronRight class="task-run-chevron" size={15} aria-hidden="true" />
              <span class="task-run-head">
                <span class="task-run-when">{when(run.ranAt)}</span>
                <span class="task-run-preview">{preview(run) || 'Nothing was written.'}</span>
              </span>
              <span class="task-run-outcome"
                ><span class="status-dot {OUTCOMES[run.outcome].dot}"></span>{OUTCOMES[run.outcome]
                  .label}</span
              >
            </summary>
            <div class="task-run-items">
              {#each shown(run) as item (item.id)}
                {#if item.role === 'tool'}<div class="tool-row"><ToolItem {item} {decide} /></div>
                {:else if item.role === 'assistant' && item.text}<div class="markdown">
                    <Markdown text={item.text} />
                  </div>{/if}
              {:else}<p class="muted-text">Nothing was written.</p>
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
