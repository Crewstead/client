import { accountHeaders, apiUrl, csrfHeaders, transportRevision } from './auth/connection.ts';
import type {
  ApprovalMode,
  ContextId,
  Context,
  Model,
  ModuleInfo,
  Project,
  Role,
  Session,
} from '@crewstead/core/protocol';

export interface Catalog {
  contexts: Context[];
  models: Model[];
  /** Project folders chats can work in (Personal only). */
  projects: Project[];
  modules: ModuleInfo[];
  /** For organisation workspaces: the caller's role and the personal-model policy. */
  policy: { allowPersonal: boolean; role?: Role };
  /** The account's own choices, e.g. how tool calls are approved. */
  preferences: { approvalMode: ApprovalMode };
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const revision = transportRevision();
  const headers = new Headers(options?.headers);
  for (const [name, value] of Object.entries(accountHeaders())) headers.set(name, value);
  if (options?.body) headers.set('Content-Type', 'application/json');
  if (options?.method && !['GET', 'HEAD'].includes(options.method.toUpperCase()))
    for (const [name, value] of Object.entries(csrfHeaders())) headers.set(name, value);
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    redirect: 'error',
    ...options,
    headers,
  });
  if (response.status === 401 && revision === transportRevision())
    window.dispatchEvent(new Event('hub-auth-expired'));
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? `Request failed (${response.status})`);
  return body as T;
}

export const scoped = (path: string, context: ContextId) => `${path}?context=${context}`;
export const getSession = (id: string, context: ContextId) =>
  request<{ session: Session; cursor: number }>(scoped(`/sessions/${id}`, context));
