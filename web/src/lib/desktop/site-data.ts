/** A site in a browser, and how many cookies it has there. */
export interface SiteCount {
  site: string;
  cookies: number;
}

type Op = 'kept' | 'remove' | 'sources' | 'sites' | 'import';
const bridge = () =>
  (globalThis as { crewsteadDesktop?: { siteData?: (op: Op, args?: unknown) => Promise<unknown> } })
    .crewsteadDesktop?.siteData;

const call = <T>(op: Op, args?: unknown) => {
  const siteData = bridge();
  if (!siteData) return Promise.reject(new Error('Only in the Crewstead app.'));
  return siteData(op, args) as Promise<T>;
};

/**
 * The desktop app's browser data (desktop/src/site-data): its sites, and importing chosen sites'
 * sign-ins from another browser on the same computer. Nothing here goes through the hub.
 */
export const siteData = {
  available: () => !!bridge(),
  kept: () => call<SiteCount[]>('kept'),
  remove: (site: string) => call<void>('remove', { site }),
  sources: () => call<{ id: string; label: string }[]>('sources'),
  sites: (source: string) => call<SiteCount[]>('sites', { source }),
  import: (source: string, sites: string[]) =>
    call<{ imported: number; skipped: number; cancelled: boolean }>('import', { source, sites }),
};
