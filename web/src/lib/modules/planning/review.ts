import { getContext, setContext } from 'svelte';
import type { PlanComment } from './api.ts';

/** What the plan page gives its elements for review: comments, adding or settling them, reopening findings. */
export interface PlanReview {
  readonly comments: PlanComment[];
  add(item: string, text: string): Promise<boolean>;
  resolve(id: string): Promise<void>;
  /** Opens a settled review finding again. */
  reopen(id: string): Promise<void>;
  /** The pass pictures and mocks load under. */
  readonly view: string | undefined;
  /** Shows pictures the owner pasted or dropped with an element; removes one. */
  addImages(item: string, files: File[]): Promise<void>;
  removeImage(item: string, file: string): Promise<void>;
}

const KEY = Symbol('plan-review');
export const provideReview = (review: PlanReview) => setContext(KEY, review);
export const useReview = () => getContext<PlanReview | undefined>(KEY);
