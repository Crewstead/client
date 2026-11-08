import type { ScheduledRun, ScheduledTask, TaskSchedule } from '@crewstead/core/protocol';
import { request } from '#lib/api.ts';

export interface TaskFields {
  title: string;
  prompt: string;
  schedule: TaskSchedule;
  timeZone: string;
}

/** This browser's time zone, which new and changed tasks keep. */
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const json = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/** The account's scheduled tasks, all of them or one chat's. */
export const tasks = {
  list: (chatId?: string) =>
    request<ScheduledTask[]>(chatId ? `/scheduled-tasks?chat=${chatId}` : '/scheduled-tasks'),
  create: (chatId: string, fields: TaskFields) =>
    request<ScheduledTask>('/scheduled-tasks', json('POST', { chatId, ...fields })),
  update: (id: string, patch: Partial<TaskFields> & { enabled?: boolean }) =>
    request<ScheduledTask>(`/scheduled-tasks/${id}`, json('PATCH', patch)),
  run: (id: string) => request<ScheduledTask>(`/scheduled-tasks/${id}/run`, json('POST')),
  remove: (id: string) => request(`/scheduled-tasks/${id}`, json('DELETE')),
  /** A task's runs, newest first, including those with nothing new that left the chat. */
  runs: (id: string) => request<ScheduledRun[]>(`/scheduled-tasks/${id}/runs`),
  /** Tells the hub this browser's time zone, for tasks the chats' models schedule. */
  saveZone: () =>
    request('/scheduled-tasks/time-zone', json('PUT', { timeZone: browserZone() })).catch(
      () => undefined,
    ),
};

/** "Tue 09:00", or with the date when it is more than a week away. */
export function shortTime(iso: string) {
  const at = new Date(iso);
  const soon = at.getTime() - Date.now() < 6 * 86_400_000;
  return at.toLocaleString(undefined, {
    ...(soon ? { weekday: 'short' } : { month: 'short', day: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}
