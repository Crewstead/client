import { getContext, setContext } from 'svelte';
import type { PlanComment } from './api.ts';

/** What the plan page gives its elements for review: comments, and adding or settling them. */
export interface PlanReview {
  readonly comments: PlanComment[];
  add(item: string, text: string): Promise<boolean>;
  resolve(id: string): Promise<void>;
}

const KEY = Symbol('plan-review');
export const provideReview = (review: PlanReview) => setContext(KEY, review);
export const useReview = () => getContext<PlanReview | undefined>(KEY);
