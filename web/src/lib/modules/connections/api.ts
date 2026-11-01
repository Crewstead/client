import type {
  ConnectionView,
  ContextId,
  ModelEntryView,
  ProviderInfo,
} from '@crewstead/core/protocol';
import { request, scoped } from '#lib/api.ts';
import { serverUrl } from '#lib/auth/connection.ts';

const send = (method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/** Provider connections. API keys are sent once and never returned. */
export const connections = {
  providers: () => request<ProviderInfo[]>('/providers'),
  list: (context: ContextId) => request<ConnectionView[]>(scoped('/connections', context)),
  get: (id: string) => request<ConnectionView>(`/connections/${id}`),
  create: (
    context: ContextId,
    body: { provider: string; label: string; apiKey: string; dailyLimitUsd: number },
  ) => request<ConnectionView>(scoped('/connections', context), send('POST', body)),
  update: (
    id: string,
    patch: { label?: string; apiKey?: string; dailyLimitUsd?: number; maxRunning?: number | null },
  ) => request<ConnectionView>(`/connections/${id}`, send('PATCH', patch)),
  refresh: (id: string) => request<ConnectionView>(`/connections/${id}/refresh`, send('POST')),
  /**
   * Starts signing in at the provider and leaves this page for its consent screen. The hub returns
   * the browser to the provider's page here (or to this page with `signin_error`).
   */
  async signIn(options: {
    context: ContextId;
    provider: string;
    connectionId?: string;
    label?: string;
    dailyLimitUsd?: number;
  }) {
    const { authorizeUrl } = await request<{ authorizeUrl: string }>(
      '/connections/sign-in',
      send('POST', {
        ...options,
        server: serverUrl(),
        returnPath: `${location.pathname}${location.search}`.replace(/[?&]signin_error=[^&]*/, ''),
      }),
    );
    location.assign(authorizeUrl);
  },
  remove: (id: string) => request(`/connections/${id}`, send('DELETE')),
  updateModel: (
    id: string,
    modelId: string,
    patch: Partial<
      Pick<ModelEntryView, 'enabled' | 'inputUsd' | 'cachedInputUsd' | 'outputUsd'>
    > & {
      /** Follow the provider's listed price, discount included. */
      followListed?: true;
    },
  ) => request<ConnectionView>(`/connections/${id}/models/${modelId}`, send('PATCH', patch)),
};
