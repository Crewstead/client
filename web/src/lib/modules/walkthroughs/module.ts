import { WALKTHROUGH_TOOL } from '@crewstead/core/protocol';
import type { ClientModule } from '../types.ts';

/** Walkthroughs: a card in the chat that opens the step-by-step viewer (docs/plan/35-walkthroughs.md). */
export const walkthroughsClient: ClientModule = {
  id: 'walkthroughs',
  toolViews: { [WALKTHROUGH_TOOL]: () => import('./WalkCard.svelte') },
};
