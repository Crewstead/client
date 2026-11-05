import { execFile } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ChromeSource } from './chrome-sources.ts';

const run = promisify(execFile);

/**
 * Turns a browser's encrypted cookie values back into text, the way the browser itself does on each
 * system. Keys are read once, held in memory only, and never written or logged. Values encrypted
 * with Chrome's app-bound key on Windows (v20) cannot be read by other programs: they are skipped.
 */
export interface Decryptor {
  /** The cookie's value, or undefined when it cannot be read here. */
  decrypt(encrypted: Buffer): string | undefined;
}

/**
 * The decryptor for a source's cookie values (`prefixes`: which of v10/v11/v20 occur). `version` is
 * the cookies file's own (from 24 on, values start with a 32-byte hash of their host).
 */
export async function decryptorFor(
  source: ChromeSource,
  prefixes: Set<string>,
  version: number,
  platform = process.platform,
): Promise<Decryptor> {
  const strip = (plain: Buffer) => (version >= 24 ? plain.subarray(32) : plain).toString('utf8');
  if (platform === 'win32') {
    const key = prefixes.has('v10') || prefixes.has('v11') ? await windowsKey(source) : undefined;
    return {
      decrypt(encrypted) {
        const prefix = encrypted.subarray(0, 3).toString();
        if (!key || (prefix !== 'v10' && prefix !== 'v11')) return undefined;
        const nonce = encrypted.subarray(3, 15);
        const tag = encrypted.subarray(-16);
        const decipher = createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAuthTag(tag);
        return strip(
          Buffer.concat([decipher.update(encrypted.subarray(15, -16)), decipher.final()]),
        );
      },
    };
  }
  // Linux and macOS: AES-128-CBC with a key derived from a password.
  const iterations = platform === 'darwin' ? 1003 : 1;
  const derive = (password: string) => pbkdf2Sync(password, 'saltysalt', iterations, 16, 'sha1');
  const keys: Record<string, Buffer> = {};
  if (platform === 'darwin') {
    if (prefixes.has('v10')) keys.v10 = derive(await keychainPassword(source));
  } else {
    // v10 is Chromium's fixed fallback password, used where no keyring was available.
    if (prefixes.has('v10')) keys.v10 = derive('peanuts');
    if (prefixes.has('v11')) keys.v11 = derive(await keyringPassword(source));
  }
  return {
    decrypt(encrypted) {
      const key = keys[encrypted.subarray(0, 3).toString()];
      if (!key) return undefined;
      const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
      return strip(Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]));
    },
  };
}

/** Linux: the browser's password from the system keyring (Secret Service, else KWallet). */
async function keyringPassword(source: ChromeSource) {
  const tries: [string, string[]][] = [
    ['secret-tool', ['lookup', 'application', source.kind.secret]],
    [
      'kwallet-query',
      [
        '-r',
        `${source.kind.keychain} Safe Storage`,
        '-f',
        `${source.kind.keychain} Keys`,
        'kdewallet',
      ],
    ],
  ];
  for (const [program, args] of tries) {
    const found = await run(program, args, { timeout: 30_000 }).catch(() => undefined);
    const password = found?.stdout.trim();
    if (password) return password;
  }
  throw new Error(
    `${source.kind.name}'s key is not in the system keyring (or the keyring is locked). Unlock it and try again.`,
  );
}

/** macOS: the browser's password from the Keychain; macOS asks its owner to allow this. */
async function keychainPassword(source: ChromeSource) {
  const found = await run(
    'security',
    ['find-generic-password', '-w', '-s', `${source.kind.keychain} Safe Storage`],
    { timeout: 120_000 },
  ).catch(() => undefined);
  const password = found?.stdout.trim();
  if (!password) throw new Error(`macOS did not give ${source.kind.name}'s key (not allowed?).`);
  return password;
}

/** Windows: the browser's key from its "Local State", unlocked for this user by Windows (DPAPI). */
async function windowsKey(source: ChromeSource) {
  const state = JSON.parse(readFileSync(join(source.root, 'Local State'), 'utf8')) as {
    os_crypt?: { encrypted_key?: string };
  };
  const wrapped = Buffer.from(state.os_crypt?.encrypted_key ?? '', 'base64');
  if (wrapped.subarray(0, 5).toString() !== 'DPAPI') throw new Error('No key in Local State.');
  const script =
    'Add-Type -AssemblyName System.Security;' +
    '[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect(' +
    "[Convert]::FromBase64String($env:CREWSTEAD_WRAPPED), $null, 'CurrentUser'))";
  const { stdout } = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      env: { ...process.env, CREWSTEAD_WRAPPED: wrapped.subarray(5).toString('base64') },
      timeout: 30_000,
    },
  );
  return Buffer.from(stdout.trim(), 'base64');
}
