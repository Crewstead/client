import { describe, expect, it } from 'vitest';
import {
  chromeClientHints,
  chromeRequestHeaders,
  tabUserAgent,
  withChromeBrand,
} from '../../desktop/src/tab-identity.ts';

// The built-in tab's real user agent.
const ELECTRON_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) @crewstead/desktop/0.7.58 Chrome/152.0.7977.167 Electron/44.9.0 Safari/537.36';
const CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

describe('tabUserAgent', () => {
  it("turns Electron's user agent into plain Chrome", () => {
    expect(tabUserAgent(ELECTRON_UA)).toBe(CHROME_UA);
  });

  it('drops a Crewstead/ token too', () => {
    expect(
      tabUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Crewstead/0.4.2 Chrome/146.0.7680.65 Electron/44.9.0 Safari/537.36',
      ),
    ).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    );
  });

  it('is idempotent', () => {
    expect(tabUserAgent(CHROME_UA)).toBe(CHROME_UA);
  });

  it('leaves a user agent without Chrome/ as it is', () => {
    expect(tabUserAgent('Something/1.0 Electron/44.9.0')).toBe('Something/1.0 Electron/44.9.0');
    expect(tabUserAgent('')).toBe('');
  });
});

describe('withChromeBrand', () => {
  it('adds Google Chrome with the Chromium version', () => {
    expect(withChromeBrand('"Chromium";v="152", "Not-A.Brand";v="24"')).toBe(
      '"Chromium";v="152", "Not-A.Brand";v="24", "Google Chrome";v="152"',
    );
  });

  it('uses the full version in a full version list', () => {
    expect(withChromeBrand('"Chromium";v="152.0.7977.167", "Not-A.Brand";v="24.0.0.0"')).toBe(
      '"Chromium";v="152.0.7977.167", "Not-A.Brand";v="24.0.0.0", "Google Chrome";v="152.0.7977.167"',
    );
  });

  it('leaves values with Google Chrome or without Chromium as they are', () => {
    const chrome = '"Chromium";v="152", "Google Chrome";v="152"';
    expect(withChromeBrand(chrome)).toBe(chrome);
    expect(withChromeBrand('"Other";v="1"')).toBe('"Other";v="1"');
    expect(withChromeBrand('')).toBe('');
  });
});

describe('chromeClientHints', () => {
  it("gives Chrome's low-entropy hints for the user agent", () => {
    expect(chromeClientHints(ELECTRON_UA)).toEqual({
      'sec-ch-ua': '"Chromium";v="152", "Google Chrome";v="152", "Not_A Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
    });
  });

  it('names Windows and macOS', () => {
    expect(chromeClientHints('(Windows NT 10.0) Chrome/150.0.1.2')['sec-ch-ua-platform']).toBe(
      '"Windows"',
    );
    expect(
      chromeClientHints('(Macintosh; Intel Mac OS X 10_15_7) Chrome/150.0.1.2')[
        'sec-ch-ua-platform'
      ],
    ).toBe('"macOS"');
  });

  it('is empty without a Chrome version', () => {
    expect(chromeClientHints('Something/1.0')).toEqual({});
  });
});

describe('chromeRequestHeaders', () => {
  const hints = chromeClientHints(ELECTRON_UA);

  it('adds the missing hints on https', () => {
    expect(chromeRequestHeaders('https://archiveofourown.org/', { Accept: '*/*' }, hints)).toEqual({
      Accept: '*/*',
      ...hints,
    });
  });

  it('adds nothing on plain http', () => {
    expect(chromeRequestHeaders('http://example.com/', { Accept: '*/*' }, hints)).toEqual({
      Accept: '*/*',
    });
  });

  it('rewrites present brand headers whatever their case, and keeps other present hints', () => {
    const headers = {
      'Sec-CH-UA': '"Chromium";v="152", "Not-A.Brand";v="24"',
      'sec-ch-ua-full-version-list': '"Chromium";v="152.0.7977.167"',
      'Sec-CH-UA-Platform': '"Linux"',
    };
    const result = chromeRequestHeaders('https://example.com/', headers, hints);
    expect(result['Sec-CH-UA']).toBe(
      '"Chromium";v="152", "Not-A.Brand";v="24", "Google Chrome";v="152"',
    );
    expect(result['sec-ch-ua-full-version-list']).toBe(
      '"Chromium";v="152.0.7977.167", "Google Chrome";v="152.0.7977.167"',
    );
    expect(result['Sec-CH-UA-Platform']).toBe('"Linux"');
    expect(result).not.toHaveProperty('sec-ch-ua');
    expect(result).not.toHaveProperty('sec-ch-ua-platform');
    expect(result['sec-ch-ua-mobile']).toBe('?0');
    expect(headers['Sec-CH-UA']).toBe('"Chromium";v="152", "Not-A.Brand";v="24"');
  });
});
