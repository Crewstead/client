import { createCipheriv, createHash, pbkdf2Sync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, expect, it } from 'vitest';
import { chromeCookies, chromeSites } from '../../desktop/src/site-data/chrome-cookies.ts';
import { chromeSources, siteOf } from '../../desktop/src/site-data/chrome-sources.ts';

const root = mkdtempSync(join(tmpdir(), 'hub-chrome-import-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** As Chromium on Linux without a keyring: v10, AES-128-CBC, the host's hash first (version 24). */
function v10(host: string, value: string) {
  const key = pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
  const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
  const plain = Buffer.concat([createHash('sha256').update(host).digest(), Buffer.from(value)]);
  return Buffer.concat([Buffer.from('v10'), cipher.update(plain), cipher.final()]);
}
/** Microseconds since 1601, `days` from now. */
const chromeTime = (days: number) =>
  BigInt(Math.round((Date.now() / 1000 + 11_644_473_600 + days * 86_400) * 1e6));

function fakeChrome() {
  const folder = join(root, 'google-chrome');
  mkdirSync(join(folder, 'Default'), { recursive: true });
  writeFileSync(
    join(folder, 'Local State'),
    JSON.stringify({ profile: { info_cache: { Default: { name: 'Work' } } } }),
  );
  const db = new DatabaseSync(join(folder, 'Default', 'Cookies'));
  db.exec(`CREATE TABLE meta (key TEXT, value TEXT); INSERT INTO meta VALUES ('version', '24');
    CREATE TABLE cookies (host_key TEXT, top_frame_site_key TEXT, name TEXT, value TEXT,
      encrypted_value BLOB, path TEXT, expires_utc INTEGER, is_secure INTEGER, is_httponly INTEGER,
      samesite INTEGER, has_expires INTEGER, is_persistent INTEGER)`);
  const add = db.prepare('INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 1, 1)');
  add.run(
    '.github.com',
    '',
    'user_session',
    '',
    v10('.github.com', 'secret-1'),
    '/',
    chromeTime(30),
    1,
  );
  add.run('github.com', '', 'plain', 'shown', Buffer.alloc(0), '/', chromeTime(30), 2);
  add.run(
    'www.bbc.co.uk',
    '',
    'locked',
    '',
    Buffer.from('v20xxxxxxxxxxxxxxxxxxxxxxxx'),
    '/',
    chromeTime(30),
    -1,
  );
  add.run(
    'ads.example',
    'https://news.example',
    'partitioned',
    'x',
    Buffer.alloc(0),
    '/',
    chromeTime(30),
    0,
  );
  add.run('github.com', '', 'old', 'gone', Buffer.alloc(0), '/', chromeTime(-1), 1);
  db.close();
}

it('names sites as people do', () => {
  expect(siteOf('.github.com')).toBe('github.com');
  expect(siteOf('gist.github.com')).toBe('github.com');
  expect(siteOf('www.bbc.co.uk')).toBe('bbc.co.uk');
  expect(siteOf('localhost')).toBe('localhost');
});

it("lists a browser's sites without decrypting, and imports the chosen ones' cookies", async () => {
  fakeChrome();
  const [source] = chromeSources(root, 'linux');
  expect(source).toMatchObject({ id: 'Chrome|Default', label: 'Chrome' });
  expect(chromeSites(source!)).toEqual([
    { site: 'bbc.co.uk', cookies: 1 },
    { site: 'github.com', cookies: 3 },
  ]);

  const { cookies, skipped } = await chromeCookies(source!, ['github.com', 'bbc.co.uk']);
  // The expired cookie is left out; the v20 one (Windows' app-bound key) cannot be read here.
  expect(skipped).toBe(1);
  expect(cookies.map((cookie) => [cookie.name, cookie.value])).toEqual([
    ['user_session', 'secret-1'],
    ['plain', 'shown'],
  ]);
  expect(cookies[0]).toMatchObject({
    url: 'https://github.com/',
    domain: '.github.com',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
  });
  expect(cookies[1]).not.toHaveProperty('domain');
  expect(cookies[0]!.expirationDate).toBeGreaterThan(Date.now() / 1000);
});
