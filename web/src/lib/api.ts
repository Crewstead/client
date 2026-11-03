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
  /** The account's own choices: how tool calls are approved, how the left panel orders places. */
  preferences: { approvalMode: ApprovalMode; placeOrder?: string[] };
}

/** The hub restarting (a new version going live) or its proxy unable to reach it for a moment. */
const RESTARTING = new Set([502, 503, 504]);
/** How long a read waits between tries while the hub restarts: about 15 seconds in all. */
const RETRY_MS = [1_000, 2_000, 4_000, 8_000];

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const revision = transportRevision();
  const headers = new Headers(options?.headers);
  for (const [name, value] of Object.entries(accountHeaders())) headers.set(name, value);
  if (options?.body) headers.set('Content-Type', 'application/json');
  const reading = !options?.method || ['GET', 'HEAD'].includes(options.method.toUpperCase());
  if (!reading) for (const [name, value] of Object.entries(csrfHeaders())) headers.set(name, value);
  const send = () =>
    fetch(apiUrl(path), { credentials: 'include', redirect: 'error', ...options, headers });
  let response = await send();
  // Reads are tried again while the hub restarts, so a release going live shows no error; a change
  // is not, as it may have been made before the answer was lost.
  for (const wait of reading ? RETRY_MS : []) {
    if (!RESTARTING.has(response.status)) break;
    await new Promise((done) => setTimeout(done, wait));
    response = await send();
  }
  if (response.status === 401 && revision === transportRevision())
    window.dispatchEvent(new Event('hub-auth-expired'));
  // A proxy's error page is HTML, not the hub's JSON.
  const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
  if (!response.ok)
    throw new Error(
      body?.message ??
        (RESTARTING.has(response.status)
          ? 'The hub is restarting or out of reach. Try again in a moment.'
          : `Request failed (${response.status})`),
    );
  if (body === undefined) throw new Error('The hub sent an answer this app cannot read.');
  return body as T;
}

export const scoped = (path: string, context: ContextId) => `${path}?context=${context}`;
export const getSession = (id: string, context: ContextId) =>
  request<{ session: Session; cursor: number }>(scoped(`/sessions/${id}`, context));
