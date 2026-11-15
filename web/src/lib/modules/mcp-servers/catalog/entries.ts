import type { SimpleIcon } from 'simple-icons';

/**
 * How a service signs Crewstead in: it registers itself (`oauth`), with the owner's own client
 * (`own-client`, for services that let no app register), with a key sent in a header, or not at all.
 */
export type CatalogAuth =
  | { kind: 'oauth' }
  | { kind: 'own-client' }
  | { kind: 'key'; header: string; prefix: string; label: string }
  | { kind: 'none' };

/** A vendor-run remote MCP server, checked against the vendor's own documentation (2026-11-15). */
export interface CatalogEntry {
  /** Also the server's name in Crewstead. */
  id: string;
  name: string;
  category: string;
  description: string;
  url: string;
  auth: CatalogAuth;
  docs: string;
  icon?: SimpleIcon;
  preview?: boolean;
}

export const oauth = { kind: 'oauth' } as const;
export const own = { kind: 'own-client' } as const;
export const none = { kind: 'none' } as const;
export const bearer = (label: string) =>
  ({ kind: 'key', header: 'Authorization', prefix: 'Bearer ', label }) as const;
export const google = (
  id: string,
  name: string,
  description: string,
  host: string,
  icon: SimpleIcon,
) =>
  ({
    id,
    name,
    category: 'Google',
    description,
    url: `https://${host}.googleapis.com/mcp/v1`,
    auth: own,
    docs: 'https://developers.google.com/workspace/guides/configure-mcp-servers',
    icon,
    preview: true,
  }) satisfies CatalogEntry;

export const CATEGORIES = [
  'Work',
  'Code',
  'Docs',
  'Data',
  'Design',
  'Payments',
  'Ops',
  'Search',
  'Google',
  'Automation',
];
