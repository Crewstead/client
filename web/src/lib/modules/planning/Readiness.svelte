<script lang="ts">
  import type { Plan, PlanSection } from '@crewstead/core/plans';
  import { SECTIONS } from './sections.ts';
  let { plan }: { plan: Plan } = $props();
  const STATES = ['draft', 'detailed', 'reviewed', 'checked', 'approved'] as const;
  const words = {
    draft: 'Draft',
    detailed: 'Detailed',
    reviewed: 'Reviewed',
    checked: 'Checked',
    approved: 'Approved',
  };
  /** Each section's elements and how far each got (docs/plan/32-planning.md: readiness). */
  const rows = $derived(
    [
      ...SECTIONS.map((s) => ({ key: s.key as PlanSection, label: s.label })),
      { key: 'tasks' as PlanSection, label: 'Tasks' },
    ]
      .map((section) => ({
        ...section,
        label: section.key === 'milestones' ? 'Milestones' : section.label,
        entries: (plan[section.key] as { id: string; title: string; state?: string }[]).map(
          (entry) => ({
            id: entry.id,
            title: entry.title,
            state: (entry.state ?? 'draft') as (typeof STATES)[number],
          }),
        ),
      }))
      .filter((section) => section.entries.length),
  );
  const ready = $derived(
    rows
      .flatMap((row) => row.entries)
      .filter((e) => e.state === 'checked' || e.state === 'approved').length,
  );
  const total = $derived(rows.reduce((sum, row) => sum + row.entries.length, 0));
</script>

<section class="plan-readiness" aria-label="Readiness">
  <h2>Readiness <span>{ready} of {total} checked</span></h2>
  <div class="plan-readiness-grid">
    {#each rows as row (row.key)}
      <span class="plan-readiness-label">{row.label}</span>
      <span class="plan-readiness-cells">
        {#each row.entries as entry (entry.id)}<a
            href={`#${entry.id}`}
            data-state={entry.state}
            title={`${entry.id} ${entry.title} · ${words[entry.state]}`}
            aria-label={`${entry.id} ${words[entry.state]}`}
          ></a>{/each}
      </span>
    {/each}
  </div>
  <p class="plan-readiness-key">
    {#each STATES as state (state)}<span data-state={state}><i></i>{words[state]}</span>{/each}
  </p>
</section>
