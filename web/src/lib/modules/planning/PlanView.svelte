<script lang="ts">
  import { setContext } from 'svelte';
  import { ArrowLeft, TriangleAlert } from '@lucide/svelte';
  import type { PlanSection } from '@crewstead/core/plans';
  import { resolve } from '$app/paths';
  import {
    addComment,
    plansHref,
    resolveComment,
    type PlanComment,
    type PlanDetail,
  } from './api.ts';
  import PlanActions from './PlanActions.svelte';
  import { provideReview } from './review.ts';
  import Readiness from './Readiness.svelte';
  import PlanItem from './PlanItem.svelte';
  import PlanRecord from './PlanRecord.svelte';
  import { FILTERS, findingsByItem, SECTIONS, workGroups, type Filter } from './sections.ts';
  import '@crewstead/ui/usage.css';
  import '@crewstead/ui/plans.css';
  import '@crewstead/ui/plan-items.css';
  let {
    project,
    detail,
    reload,
  }: { project: string; detail: PlanDetail; reload: () => Promise<void> } = $props();
  let comments = $state<PlanComment[]>([]);
  let problem = $state('');
  $effect(() => void (comments = detail.comments));
  provideReview({
    get comments() {
      return comments;
    },
    get kept() {
      return detail.run?.declined ?? [];
    },
    async add(item, text) {
      problem = '';
      try {
        comments = [...comments, await addComment(project, detail.row.folder, item, text)];
        return true;
      } catch (cause) {
        problem = cause instanceof Error ? cause.message : 'The comment was not saved.';
        return false;
      }
    },
    async resolve(id) {
      await resolveComment(detail.row.folder, id).catch(() => {});
      comments = comments.map((c) => (c.id === id ? { ...c, resolved: 'Resolved' } : c));
    },
  });
  const openComments = $derived(comments.filter((c) => !c.resolved).length);
  // Research notes are read from this plan's folder (PlanNote).
  setContext('plan-place', {
    get project() {
      return project;
    },
    get folder() {
      return detail.row.folder;
    },
  });
  const plan = $derived(detail.plan!);
  const progress = $derived(detail.progress!);
  // The checks' findings and what the planning run's reviewers left open, each once.
  const findings = $derived(
    [...detail.findings, ...(detail.run?.findings ?? [])].filter(
      (finding, index, all) => all.findIndex((f) => f.message === finding.message) === index,
    ),
  );
  const byItem = $derived(findingsByItem(findings));
  const general = $derived([...(byItem.get('') ?? []), ...(byItem.get(plan.id) ?? [])]);
  let filter = $state<Filter>('all');
  const findingsOf = (id: string) => byItem.get(id) ?? [];
  const shows = (section: PlanSection, filters: Filter[], ids: string[]) =>
    filter === 'all' ||
    (filter === 'findings' ? ids.some((id) => byItem.has(id)) : filters.includes(filter));
  const keep = (id: string) => filter !== 'findings' || byItem.has(id);
  const words = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
  const work = $derived(workGroups(plan));
  const questions = $derived(
    [...plan.questions].sort((a, b) => Number(!!a.answer) - Number(!!b.answer)),
  );
  // A link to an element (T3) opens it, wherever it is, and shows every section to find it.
  $effect(() => {
    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      filter = 'all';
      requestAnimationFrame(() => {
        const target = document.getElementById(id);
        if (target instanceof HTMLDetailsElement) target.open = true;
        target?.scrollIntoView({ block: 'center' });
      });
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  });
</script>

<div class="page-container plan-page">
  <a class="back-link" href={resolve(plansHref(project) as '/')}><ArrowLeft size={15} /> Plans</a>
  <header class="plan-head">
    <h1>{plan.title}</h1>
    <p class="plan-sub">
      {words(plan.kind)} · {plan.depth} · {words(plan.status).toLowerCase()} · version {plan.version}
    </p>
  </header>
  {#if detail.offline}<p class="plan-note" role="status">
      The computer is offline. This is the version read last.
    </p>{/if}
  {#if detail.row.errors}<div class="plan-note bad" role="alert">
      <TriangleAlert size={14} /> The plan file has errors, so this is the last version that could be
      read:
      <ul>
        {#each detail.row.errors as error (error)}<li>{error}</li>{/each}
      </ul>
    </div>{/if}

  <dl class="plan-stats">
    <div>
      <dt>Tasks done</dt>
      <dd>{progress.done} of {progress.tasks}</dd>
      <span class="plan-bar" style:--done={progress.tasks ? progress.done / progress.tasks : 0}
      ></span>
    </div>
    <div>
      <dt>Criteria passing</dt>
      <dd>{progress.passing} of {progress.criteria}</dd>
    </div>
    <div>
      <dt>Open questions</dt>
      <dd>{progress.openQuestions}</dd>
    </div>
    <div>
      <dt>Findings</dt>
      <dd>{findings.length}</dd>
    </div>
  </dl>

  <p class="plan-lead">{plan.short}</p>
  <blockquote class="plan-request" aria-label="What was asked">{plan.request}</blockquote>
  <PlanActions {project} {detail} {openComments} {reload} report={(text) => (problem = text)} />
  {#if problem}<p class="plan-note bad" role="alert">{problem}</p>{/if}
  <Readiness {plan} />
  {#if general.length}<ul class="plan-findings">
      {#each general as finding (finding.message)}<li data-severity={finding.severity}>
          {finding.message}
        </li>{/each}
    </ul>{/if}

  <div class="usage-toggle plan-filter" role="group" aria-label="Show">
    {#each FILTERS as option (option.id)}
      <button aria-pressed={filter === option.id} onclick={() => (filter = option.id)}
        >{option.label}</button
      >
    {/each}
  </div>

  {#if questions.length && ['all', 'decisions'].includes(filter)}<section class="plan-section">
      <h2>Questions <span>{questions.length}</span></h2>
      {#each questions as question (question.id)}
        <div
          class="plan-item plain plan-question"
          id={question.id}
          class:answered={!!question.answer}
        >
          <span class="plan-id">{question.id}</span>
          <span class="plan-item-text"
            ><span class="plan-item-title">{question.text}</span><span class="plan-short"
              >{question.answer
                ? `Answer: ${question.answer}`
                : question.recommended
                  ? `Recommended: ${question.recommended}`
                  : (question.options.join(' · ') ?? '')}</span
            ></span
          >
          <span class="plan-badge" data-tone={question.answer ? 'muted' : 'warn'}
            >{question.answer ? 'Answered' : words(question.blocking.replace(':', ' '))}</span
          >
        </div>
      {/each}
    </section>{/if}

  {#each SECTIONS as section (section.key)}
    {#if section.key === 'milestones'}
      {#if plan.tasks.length && shows( section.key, section.filters, [...plan.milestones, ...plan.tasks].map((x) => x.id) )}<section
          class="plan-section"
        >
          <h2>Work <span>{progress.done} of {progress.tasks}</span></h2>
          {#each work.groups as group (group.milestone.id)}
            {#if keep(group.milestone.id) || group.tasks.some((t) => keep(t.id))}<div
                class="plan-group"
              >
                <PlanItem
                  section="milestones"
                  item={group.milestone}
                  findings={findingsOf(group.milestone.id)}
                />
                <div class="plan-children">
                  {#each group.tasks.filter((t) => keep(t.id)) as task (task.id)}
                    <PlanItem section="tasks" item={task} findings={findingsOf(task.id)} />
                  {/each}
                </div>
              </div>{/if}
          {/each}
          {#each work.loose.filter((t) => keep(t.id)) as task (task.id)}
            <PlanItem section="tasks" item={task} findings={findingsOf(task.id)} />
          {/each}
        </section>{/if}
    {:else}
      {@const items = plan[section.key] as { id: string; title: string; short: string }[]}
      {#if items.length && shows( section.key, section.filters, items.map((x) => x.id) )}<section
          class="plan-section"
        >
          <h2>{section.label} <span>{items.length}</span></h2>
          {#each items.filter((x) => keep(x.id)) as item (item.id)}
            <PlanItem section={section.key} {item} findings={findingsOf(item.id)} />
          {/each}
        </section>{/if}
    {/if}
  {/each}

  {#if filter === 'all'}<PlanRecord {plan} versions={detail.versions} />{/if}
</div>
