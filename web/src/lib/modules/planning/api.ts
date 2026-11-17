import type { Finding, Plan, planProgress } from '@crewstead/core/plans';
import { request } from '#lib/api.ts';

/** A plan as the list shows it (the hub's row without its text). */
export interface PlanSummary {
  folder: string;
  planId: string | null;
  title: string;
  kind: string;
  depth: string;
  status: string;
  version: number;
  errors: string[] | null;
  tasks: number;
  done: number;
  updated: string;
}

export interface PlanVersion {
  seq: number;
  version: number | null;
  author: 'agent' | 'owner' | 'external';
  chat: string | null;
  reason: string | null;
  at: string;
}

export interface PlanDetail {
  row: PlanSummary;
  plan?: Plan;
  progress?: ReturnType<typeof planProgress>;
  findings: Finding[];
  /** The plan's research notes, when the computer was reached. */
  notes?: { file: string; bytes: number }[];
  offline?: boolean;
  versions: PlanVersion[];
  comments: PlanComment[];
  /** The planning run that made the plan, when one did. */
  run?: PlanRunView;
}

export interface PlanComment {
  id: string;
  item: string;
  text: string;
  at: string;
  resolved: string | null;
}

export interface PlanRunView {
  id: string;
  stage: string;
  status: 'running' | 'waiting' | 'done' | 'failed';
  error: string | null;
  tokens: number;
  singleFamily: boolean;
  findings: Finding[];
}

const query = (project: string) => `project=${encodeURIComponent(project)}`;

export const listPlans = (project: string) =>
  request<{ plans: PlanSummary[]; offline?: boolean }>(`/plans?${query(project)}`);

export const readPlanDetail = (project: string, folder: string) =>
  request<PlanDetail>(`/plans/${encodeURIComponent(folder)}?${query(project)}`);

export const readNote = (project: string, folder: string, file: string) =>
  request<{ content: string }>(
    `/plans/${encodeURIComponent(folder)}/note?${query(project)}&file=${encodeURIComponent(file)}`,
  );

/** The app path of a project's plans, or of one plan. */
export const plansHref = (project: string, folder?: string) =>
  `/plans?${query(project)}${folder ? `&plan=${encodeURIComponent(folder)}` : ''}`;

const post = <T>(path: string, body: object) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const addComment = (project: string, folder: string, item: string, text: string) =>
  post<PlanComment>(`/plans/${encodeURIComponent(folder)}/comments`, { project, item, text });
export const resolveComment = (folder: string, id: string) =>
  post<{ resolved: true }>(`/plans/${encodeURIComponent(folder)}/comments/${id}/resolve`, {});
/** Asks the chat that made the plan to revise it for the open comments. */
export const askRevision = (project: string, folder: string) =>
  post<{ chat: string }>(`/plans/${encodeURIComponent(folder)}/revise`, { project });
/** Deletes the plan's folder on the computer and the hub's copy, versions, comments and runs. */
export const deletePlan = (project: string, folder: string) =>
  request<{ deleted: true }>(`/plans/${encodeURIComponent(folder)}?${query(project)}`, {
    method: 'DELETE',
  });
export const approvePlan = (project: string, folder: string) =>
  post<{ approved: true }>(`/plans/${encodeURIComponent(folder)}/approve`, { project });
