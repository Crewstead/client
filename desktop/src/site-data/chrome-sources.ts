import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** A Chromium-family browser as its files and its key are named on each system. */
export interface BrowserKind {
  name: string;
  /** Its folder under the system's place for app data. */
  folder: { linux: string; darwin: string; win32: string };
  /** Linux: the `application` its key is stored under in the system keyring. */
  secret: string;
  /** macOS: its Keychain item is "<keychain> Safe Storage" (Linux KWallet uses the same name). */
  keychain: string;
}

export const BROWSERS: BrowserKind[] = [
  {
    name: 'Chrome',
    folder: { linux: 'google-chrome', darwin: 'Google/Chrome', win32: 'Google/Chrome/User Data' },
    secret: 'chrome',
    keychain: 'Chrome',
  },
  {
    name: 'Chromium',
    folder: { linux: 'chromium', darwin: 'Chromium', win32: 'Chromium/User Data' },
    secret: 'chromium',
    keychain: 'Chromium',
  },
  {
    name: 'Edge',
    folder: {
      linux: 'microsoft-edge',
      darwin: 'Microsoft Edge',
      win32: 'Microsoft/Edge/User Data',
    },
    secret: 'microsoft-edge',
    keychain: 'Microsoft Edge',
  },
  {
    name: 'Brave',
    folder: {
      linux: 'BraveSoftware/Brave-Browser',
      darwin: 'BraveSoftware/Brave-Browser',
      win32: 'BraveSoftware/Brave-Browser/User Data',
    },
    secret: 'brave',
    keychain: 'Brave',
  },
  {
    name: 'Vivaldi',
    folder: { linux: 'vivaldi', darwin: 'Vivaldi', win32: 'Vivaldi/User Data' },
    secret: 'vivaldi',
    keychain: 'Vivaldi',
  },
];

/** One profile of an installed browser, with a cookies file. */
export interface ChromeSource {
  /** "<browser>|<profile folder>", as the page names it. */
  id: string;
  label: string;
  kind: BrowserKind;
  /** The browser's own data folder (with "Local State"). */
  root: string;
  cookies: string;
}

/** Where the system keeps apps' data; a test passes its own. */
export function appDataRoot(platform = process.platform, env = process.env) {
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support');
  if (platform === 'win32') return env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  return env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
}

/** Installed Chromium-family browsers' profiles that have cookies, as their owner named them. */
export function chromeSources(
  root = appDataRoot(),
  platform = process.platform as 'linux' | 'darwin' | 'win32',
): ChromeSource[] {
  return BROWSERS.flatMap((kind) => {
    const folder = join(root, kind.folder[platform] ?? kind.folder.linux);
    if (!existsSync(folder)) return [];
    const profiles = profileNames(folder);
    return Object.entries(profiles).flatMap(([dir, name]) => {
      const cookies = [join(folder, dir, 'Network', 'Cookies'), join(folder, dir, 'Cookies')].find(
        (file) => existsSync(file),
      );
      if (!cookies) return [];
      const label = Object.keys(profiles).length > 1 ? `${kind.name} · ${name}` : kind.name;
      return [{ id: `${kind.name}|${dir}`, label, kind, root: folder, cookies }];
    });
  });
}

/** Profile folders and their names, from the browser's "Local State"; just Default without it. */
function profileNames(folder: string): Record<string, string> {
  try {
    const state = JSON.parse(readFileSync(join(folder, 'Local State'), 'utf8')) as {
      profile?: { info_cache?: Record<string, { name?: string }> };
    };
    const cache = state.profile?.info_cache ?? {};
    const named = Object.fromEntries(
      Object.entries(cache).map(([dir, info]) => [dir, info.name || dir]),
    );
    if (Object.keys(named).length) return named;
  } catch {
    // No readable Local State: the default profile only.
  }
  return { Default: 'Default' };
}

/**
 * The site a cookie belongs to, as people name it: its host without "www." and subdomains, keeping
 * the country's second level where one is used (example.co.uk).
 */
export function siteOf(host: string) {
  const labels = host.replace(/^\./, '').toLowerCase().split('.');
  if (labels.length <= 2 || /^\d+$/.test(labels.at(-1)!)) return labels.join('.');
  const second = labels.at(-2)!;
  const countrySecond =
    labels.at(-1)!.length === 2 && ['co', 'com', 'net', 'org', 'ac', 'gov', 'edu'].includes(second);
  return labels.slice(countrySecond ? -3 : -2).join('.');
}
