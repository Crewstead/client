<script lang="ts">
  import { ChevronRight } from '@lucide/svelte';
  import type { Plan } from '@crewstead/core/plans';
  import Markdown from '#lib/markdown/Markdown.svelte';
  import type { PlanVersion } from './api.ts';
  let { plan, versions }: { plan: Plan; versions: PlanVersion[] } = $props();
  const record = $derived(plan.record);
  const when = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  /** What happened while the plan was worked on, newest first. */
  const log = $derived(
    [
      ...record.progress.map((entry) => ({
        ...entry,
        kind: 'Progress',
        links: entry.task ? [entry.task] : [],
      })),
      ...record.discoveries.map((entry) => ({ ...entry, kind: 'Discovery' })),
      ...record.deviations.map((entry) => ({
        ...entry,
        kind: 'Deviation',
        links: [entry.task, entry.decision],
      })),
    ].sort((a, b) => b.at.localeCompare(a.at)),
  );
  const authors = { agent: 'A model', owner: 'You', external: 'Edited in the folder' };
</script>

{#if record.outcome}<section class="plan-section">
    <h2>Outcome</h2>
    <p class="plan-lead">{record.outcome.short}</p>
    {#if record.outcome.full}<div class="markdown plan-full">
        <Markdown text={record.outcome.full} />
      </div>{/if}
  </section>{/if}

{#if log.length}<section class="plan-section">
    <h2>Record <span>{log.length}</span></h2>
    <ol class="plan-log">
      {#each log as entry, index (index)}
        <li>
          <span class="plan-log-kind">{entry.kind}</span>
          <span
            >{entry.text}{#each entry.links as link (link)}<a class="plan-id" href={`#${link}`}
                >{link}</a
              >{/each}</span
          >
          <small>{when(entry.at)}</small>
        </li>
      {/each}
    </ol>
  </section>{/if}

{#if versions.length}<details class="plan-versions">
    <summary
      ><ChevronRight size={14} class="plan-chevron" />Versions
      <span>{versions.length}</span></summary
    >
    <ol>
      {#each versions as version (version.seq)}
        <li>
          <span class="plan-version-number"
            >{version.version ? `v${version.version}` : 'Unreadable'}</span
          >
          <span>{authors[version.author]}{version.reason ? ` — ${version.reason}` : ''}</span>
          <small>{when(version.at)}</small>
        </li>
      {/each}
    </ol>
  </details>{/if}
