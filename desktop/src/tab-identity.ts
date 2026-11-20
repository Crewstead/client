/**
 * How the browser's tabs present themselves to sites: as plain Chrome rather than as Crewstead's
 * Electron. Pure string functions, kept apart from Electron so tests can run them.
 */

/** Electron's default user agent as plain Chrome: drops the app and Electron tokens, reduces the Chrome version. */
export function tabUserAgent(defaultUa: string): string {
  const chrome = /Chrome\/(\d+)[\d.]*/.exec(defaultUa);
  if (!chrome) return defaultUa;
  return defaultUa
    .replace(/ (?:\S*crewstead\S*|Electron\/\S+)/gi, '')
    .replace(chrome[0], `Chrome/${chrome[1]}.0.0.0`);
}

/** Adds "Google Chrome", with the Chromium entry's version, to one sec-ch-ua style header value. */
export function withChromeBrand(header: string): string {
  if (header.includes('"Google Chrome"')) return header;
  const chromium = /"Chromium";v="([^"]+)"/.exec(header);
  return chromium ? `${header}, "Google Chrome";v="${chromium[1]}"` : header;
}

const PLATFORMS: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/CrOS/, 'Chrome OS'],
  [/Android/, 'Android'],
  [/Linux|X11/, 'Linux'],
];

/**
 * The low-entropy client hints Chrome sends on every secure request, for a user agent; empty when
 * it has no Chrome version. Electron's tabs send none, which no real Chrome does.
 */
export function chromeClientHints(ua: string): Record<string, string> {
  const major = /Chrome\/(\d+)/.exec(ua)?.[1];
  if (!major) return {};
  const hints: Record<string, string> = {
    'sec-ch-ua': `"Chromium";v="${major}", "Google Chrome";v="${major}", "Not_A Brand";v="99"`,
    'sec-ch-ua-mobile': /Mobile|Android/.test(ua) ? '?1' : '?0',
  };
  const platform = PLATFORMS.find(([pattern]) => pattern.test(ua))?.[1];
  if (platform) hints['sec-ch-ua-platform'] = `"${platform}"`;
  return hints;
}

const BRAND_HEADERS = /^sec-ch-ua(-full-version-list)?$/i;

/**
 * A request's headers as Chrome would send them: brand headers that are present gain Google Chrome,
 * and on https the missing low-entropy hints are added. Returns a new object.
 */
export function chromeRequestHeaders(
  url: string,
  headers: Record<string, string>,
  hints: Record<string, string>,
): Record<string, string> {
  const result = { ...headers };
  const present = new Set<string>();
  for (const [name, value] of Object.entries(result)) {
    present.add(name.toLowerCase());
    if (BRAND_HEADERS.test(name)) result[name] = withChromeBrand(value);
  }
  if (url.startsWith('https:') || url.startsWith('wss:'))
    for (const [name, value] of Object.entries(hints)) if (!present.has(name)) result[name] = value;
  return result;
}
