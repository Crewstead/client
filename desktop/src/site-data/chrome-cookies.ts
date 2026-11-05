import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { decryptorFor } from './chrome-keys.ts';
import { siteOf, type ChromeSource } from './chrome-sources.ts';

/** A cookie as Electron sets it (session.cookies.set). */
export interface ImportedCookie {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  /** Seconds since 1970; none for a cookie that ends with the browser session. */
  expirationDate?: number;
  sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
}

interface Row {
  host_key: string;
  name: string;
  value: string;
  encrypted_value: Uint8Array;
  path: string;
  expires_utc: bigint;
  is_secure: number;
  is_httponly: number;
  samesite: number;
  persistent: boolean;
  top_frame_site_key?: string;
}

/** All cookies of the file. Chromium's times overflow a number, so integers are read as BigInt. */
function readRows(db: DatabaseSync): Row[] {
  const query = db.prepare('SELECT * FROM cookies');
  query.setReadBigInts(true);
  return (query.all() as Record<string, unknown>[]).map((row) => ({
    host_key: String(row.host_key),
    name: String(row.name),
    value: String(row.value ?? ''),
    encrypted_value: (row.encrypted_value as Uint8Array) ?? new Uint8Array(),
    path: String(row.path ?? '/'),
    expires_utc: BigInt((row.expires_utc as bigint | undefined) ?? 0n),
    is_secure: Number(row.is_secure ?? 0),
    is_httponly: Number(row.is_httponly ?? 0),
    samesite: Number(row.samesite ?? -1),
    persistent: Number(row.is_persistent ?? row.has_expires ?? 1) === 1,
    top_frame_site_key: row.top_frame_site_key ? String(row.top_frame_site_key) : undefined,
  }));
}

/** Seconds between 1601 (Chromium's epoch) and 1970. */
const EPOCH_GAP = 11_644_473_600;
const SAME_SITE = { [-1]: 'unspecified', 0: 'no_restriction', 1: 'lax', 2: 'strict' } as const;

/**
 * Reads the browser's cookies file from a copy (the browser may hold it open). On Windows a running
 * Chrome locks it: the owner closes Chrome first.
 */
function withCopy<T>(source: ChromeSource, read: (db: DatabaseSync) => T): T {
  const folder = mkdtempSync(join(tmpdir(), 'crewstead-cookies-'));
  try {
    const copy = join(folder, basename(source.cookies));
    try {
      copyFileSync(source.cookies, copy);
      for (const suffix of ['-wal', '-journal'])
        if (existsSync(source.cookies + suffix))
          copyFileSync(source.cookies + suffix, copy + suffix);
    } catch {
      throw new Error(
        `Close ${source.kind.name} and try again: it keeps its cookies locked while open.`,
      );
    }
    const db = new DatabaseSync(copy, { readOnly: true });
    try {
      return read(db);
    } finally {
      db.close();
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** Partitioned cookies (set inside another site's frame) are not imported. */
const ownSite = (row: Pick<Row, 'top_frame_site_key'>) => !row.top_frame_site_key;

/** The sites with cookies in a browser profile, and how many each: names only, nothing decrypted. */
export function chromeSites(source: ChromeSource) {
  const rows = withCopy(source, readRows);
  const counts = new Map<string, number>();
  for (const row of rows.filter(ownSite)) {
    const site = siteOf(row.host_key);
    counts.set(site, (counts.get(site) ?? 0) + 1);
  }
  return [...counts]
    .map(([site, cookies]) => ({ site, cookies }))
    .sort((a, b) => a.site.localeCompare(b.site));
}

/** The cookies of the chosen sites, decrypted; how many could not be read is counted. */
export async function chromeCookies(source: ChromeSource, sites: string[]) {
  const wanted = new Set(sites);
  const { rows, version } = withCopy(source, (db) => ({
    rows: readRows(db).filter((row) => ownSite(row) && wanted.has(siteOf(row.host_key))),
    version: Number(
      (db.prepare("SELECT value FROM meta WHERE key = 'version'").get() as { value?: string })
        ?.value ?? 0,
    ),
  }));
  const prefixes = new Set(
    rows
      .filter((row) => row.encrypted_value?.length)
      .map((row) => Buffer.from(row.encrypted_value).subarray(0, 3).toString()),
  );
  const decryptor = await decryptorFor(source, prefixes, version);
  const cookies: ImportedCookie[] = [];
  let skipped = 0;
  for (const row of rows) {
    let value: string | undefined = row.value;
    if (!value && row.encrypted_value?.length) {
      try {
        value = decryptor.decrypt(Buffer.from(row.encrypted_value));
      } catch {
        value = undefined;
      }
    }
    if (value === undefined) {
      skipped++;
      continue;
    }
    const host = row.host_key.replace(/^\./, '');
    const expires = Number(row.expires_utc / 1000n) / 1000 - EPOCH_GAP;
    if (row.persistent && expires < Date.now() / 1000) continue;
    cookies.push({
      url: `${row.is_secure ? 'https' : 'http'}://${host}${row.path || '/'}`,
      name: row.name,
      value,
      // A host key with a leading dot is for the domain and its subdomains; else for that host only.
      ...(row.host_key.startsWith('.') ? { domain: row.host_key } : {}),
      path: row.path || '/',
      secure: !!row.is_secure,
      httpOnly: !!row.is_httponly,
      ...(row.persistent ? { expirationDate: expires } : {}),
      sameSite: SAME_SITE[row.samesite as -1 | 0 | 1 | 2] ?? 'unspecified',
    });
  }
  return { cookies, skipped };
}
