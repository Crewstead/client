import type { CatalogEntry } from './entries.ts';
import { work } from './work.ts';
import { codeDocs } from './code-docs.ts';
import { dataDesign } from './data-design.ts';
import { ops } from './ops.ts';
import { googleMore } from './google-more.ts';

export { CATEGORIES, type CatalogAuth, type CatalogEntry } from './entries.ts';

/** Vendor-run remote MCP servers, as Add server offers them. */
export const catalog: CatalogEntry[] = [...work, ...codeDocs, ...dataDesign, ...ops, ...googleMore];
