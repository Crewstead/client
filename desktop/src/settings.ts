import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** What the app remembers on this computer: the hub it opens and how it starts. */
export interface Settings {
  hub?: string;
  /** Start with the computer (in the tray); on unless turned off. */
  autostart?: boolean;
  /** The owner said no to letting chats use this computer for this hub; asked again from the tray. */
  declined?: string;
}

const file = () => join(app.getPath('userData'), 'settings.json');

export function readSettings(): Settings {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Settings) : {};
  } catch {
    return {};
  }
}

export function writeSettings(patch: Partial<Settings>) {
  const next = { ...readSettings(), ...patch };
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

/** A hub address as an origin: https, or plain http on this computer only. */
export function hubOrigin(input: string) {
  const url = new URL(
    /^[a-z]+:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`,
  );
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    throw new Error('Use an https:// address (http:// only for this computer).');
  return url.origin;
}
