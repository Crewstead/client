import type { Finding, Plan, PlanSection } from '@crewstead/core/plans';

/** The plan page's filters: everything, or one concern across sections. */
export type Filter = 'all' | 'decisions' | 'work' | 'ui' | 'risks' | 'findings';
export const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'work', label: 'Work' },
  { id: 'ui', label: 'UI' },
  { id: 'risks', label: 'Risks' },
  { id: 'findings', label: 'Findings' },
];

/** Sections in reading order; milestones and tasks are drawn together as the work. */
export const SECTIONS: {
  key: Exclude<PlanSection, 'questions' | 'tasks'>;
  label: string;
  filters: Filter[];
}[] = [
  { key: 'goals', label: 'Goals', filters: [] },
  { key: 'non_goals', label: 'Not doing', filters: [] },
  { key: 'requirements', label: 'Requirements', filters: ['work'] },
  { key: 'research', label: 'Research', filters: ['decisions'] },
  { key: 'decisions', label: 'Decisions', filters: ['decisions'] },
  { key: 'assumptions', label: 'Assumptions', filters: ['decisions', 'risks'] },
  { key: 'facts', label: 'Facts', filters: [] },
  { key: 'design', label: 'Design', filters: [] },
  { key: 'screens', label: 'Screens', filters: ['ui'] },
  { key: 'journeys', label: 'Journeys', filters: ['ui'] },
  { key: 'edge_cases', label: 'Edge cases', filters: ['risks'] },
  { key: 'acceptance', label: 'Acceptance', filters: ['work'] },
  { key: 'tests', label: 'Tests', filters: ['work'] },
  { key: 'milestones', label: 'Work', filters: ['work'] },
  { key: 'risks', label: 'Risks', filters: ['risks'] },
  { key: 'release', label: 'Release', filters: ['work'] },
];

/** Findings by the element they concern; those about the whole plan under its id. */
export function findingsByItem<T extends Finding>(findings: T[]) {
  const map = new Map<string, T[]>();
  for (const finding of findings) {
    const key = finding.item ?? '';
    map.set(key, [...(map.get(key) ?? []), finding]);
  }
  return map;
}

/** A short state shown on an element's row, and its tone. */
export function badgeOf(
  section: PlanSection,
  item: Record<string, unknown>,
): { text: string; tone: 'muted' | 'good' | 'warn' | 'bad' } | undefined {
  const status = String(item.status ?? '');
  const words = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
  switch (section) {
    case 'decisions':
      if (status === 'made') return { text: String(item.choice ?? 'Made'), tone: 'muted' };
      return status === 'superseded'
        ? { text: 'Replaced', tone: 'muted' }
        : { text: item.by === 'owner' ? 'Yours to decide' : 'Open', tone: 'warn' };
    case 'tasks':
      return {
        text: words(status),
        tone:
          status === 'done'
            ? 'good'
            : status === 'failed' || status === 'blocked'
              ? 'bad'
              : 'muted',
      };
    case 'acceptance':
      return {
        text: words(status),
        tone: status === 'passing' ? 'good' : status === 'failing' ? 'bad' : 'muted',
      };
    case 'assumptions':
      return status === 'wrong'
        ? { text: 'Wrong', tone: 'bad' }
        : {
            text: `${words(String(item.confidence))} confidence`,
            tone: status === 'confirmed' ? 'good' : 'muted',
          };
    case 'risks':
      return {
        text: `${words(String(item.likelihood))} · ${String(item.impact)} impact`,
        tone: item.impact === 'high' ? 'warn' : 'muted',
      };
    case 'research':
      return { text: `${words(String(item.confidence))} confidence`, tone: 'muted' };
    case 'requirements':
      return item.kind === 'quality' ? { text: 'Quality', tone: 'muted' } : undefined;
    default:
      return undefined;
  }
}

/** Tasks grouped under their milestones; tasks without one come last. */
export function workGroups(plan: Plan) {
  const groups = plan.milestones.map((milestone) => ({
    milestone,
    tasks: plan.tasks.filter((task) => task.milestone === milestone.id),
  }));
  const loose = plan.tasks.filter((task) => !plan.milestones.some((m) => m.id === task.milestone));
  return { groups, loose };
}
