import type { ClientModule } from '../types.ts';

/** Plans in project folders: the plans page and the chat panel's list (docs/plan/32-planning.md). */
export const planningClient: ClientModule = {
  id: 'planning',
  panels: [
    { slot: 'chat-panel', order: 5, load: () => import('./PanelPlans.svelte') },
    { slot: 'plan-page', order: 0, load: () => import('./PlansPage.svelte') },
  ],
  toolViews: { plan_make: () => import('./PlanMakeCard.svelte') },
};
