import type { Evidence, PlanSection } from '@crewstead/core/plans';

/** What an element shows when opened, besides its full text: rows of a few kinds the page knows how to draw. */
export type DetailRow =
  | { label: string; kind: 'text'; text: string }
  | { label: string; kind: 'refs'; refs: string[] }
  | { label: string; kind: 'code'; lines: string[] }
  | {
      label: string;
      kind: 'options';
      options: { label: string; short: string; cons?: string; chosen: boolean }[];
    }
  | { label: string; kind: 'steps'; steps: Step[]; when?: string }
  | { label: string; kind: 'cases'; cases: { name: string; given?: string; expect: string }[] }
  | { label: string; kind: 'evidence'; evidence: Evidence[] }
  /** A research note in the plan folder, read when opened. */
  | { label: string; kind: 'note'; file: string };

export interface Step {
  screen: string;
  control?: string;
  action: string;
  result: string;
  source?: string;
}

type Item = Record<string, unknown>;
const list = <T>(value: unknown) => (Array.isArray(value) ? (value as T[]) : []);
const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

export function detailRows(section: PlanSection, item: Item): DetailRow[] {
  const rows: DetailRow[] = [];
  const add = (row: DetailRow | undefined) => row && rows.push(row);
  const refs = (label: string, value: unknown) => {
    const ids = list<string>(value);
    if (ids.length) add({ label, kind: 'refs', refs: ids });
  };
  const plain = (label: string, value: unknown) => {
    const found = text(value);
    if (found) add({ label, kind: 'text', text: found });
  };
  switch (section) {
    case 'decisions': {
      const options = list<{ label: string; short: string; cons?: string }>(item.options);
      if (options.length)
        add({
          label: 'Options',
          kind: 'options',
          options: options.map((o) => ({ ...o, chosen: o.label === item.choice })),
        });
      plain('Why', item.why);
      if (item.reversible === false) plain('Undo', 'Cannot be undone once built.');
      break;
    }
    case 'tasks': {
      const files = list<{ path: string; change: string; symbols?: string[] }>(item.files);
      if (files.length)
        add({
          label: 'Files',
          kind: 'code',
          lines: files.map(
            (f) => `${f.change} ${f.path}${f.symbols?.length ? ` (${f.symbols.join(', ')})` : ''}`,
          ),
        });
      refs('After', item.deps);
      refs('Decisions', item.decisions);
      refs('Proves', item.acceptance);
      plain('Rollback', item.rollback);
      break;
    }
    case 'acceptance': {
      const check = item.check as { kind: string; run?: string; why?: string } | undefined;
      if (check?.run) add({ label: `Check (${check.kind})`, kind: 'code', lines: [check.run] });
      else if (check) plain(`Check (${check.kind})`, check.why ?? 'By looking.');
      refs('Covers', item.covers);
      break;
    }
    case 'facts':
      add({ label: 'Where', kind: 'code', lines: list<string>(item.refs) });
      break;
    case 'research': {
      plain('Question', item.question);
      const sources = list<{ kind: string; ref: string; note?: string }>(item.sources);
      if (sources.length)
        add({
          label: 'Sources',
          kind: 'code',
          lines: sources.map((s) => `${s.ref}${s.note ? ` — ${s.note}` : ''}`),
        });
      plain('Not covered', item.gaps);
      if (text(item.note)) add({ label: 'Note', kind: 'note', file: String(item.note) });
      break;
    }
    case 'assumptions':
      plain('Wrong if', item.wrong_if);
      break;
    case 'risks':
      plain('Mitigation', item.mitigation);
      refs('Handled by', item.task ? [item.task] : []);
      break;
    case 'screens': {
      const states = list<{ name: string; short: string }>(item.states);
      if (states.length)
        add({
          label: 'States',
          kind: 'cases',
          cases: states.map((s) => ({ name: s.name, expect: s.short })),
        });
      break;
    }
    case 'journeys': {
      plain('Starting from', item.start);
      add({ label: 'Steps', kind: 'steps', steps: list<Step>(item.steps) });
      for (const branch of list<{ when: string; steps: Step[] }>(item.branches))
        add({ label: 'If', kind: 'steps', steps: branch.steps, when: branch.when });
      break;
    }
    case 'tests': {
      plain('File', item.file);
      const cases = list<{ name: string; given?: string; expect: string }>(item.cases);
      if (cases.length) add({ label: 'Cases', kind: 'cases', cases });
      break;
    }
    case 'milestones':
      refs('Done when', item.acceptance);
      plain('Rollback', item.rollback);
      break;
    case 'edge_cases':
      refs('Related', item.links);
      break;
  }
  refs('Based on', item.based_on);
  const evidence = list<Evidence>(item.evidence);
  if (evidence.length) add({ label: 'Evidence', kind: 'evidence', evidence });
  return rows;
}
