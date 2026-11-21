import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { PasswordPrompt } from '@crewstead/core/protocol';
import { Askpass } from '../../daemon/src/tools/askpass.ts';
import { PasswordPrompts } from '../../daemon/src/tools/password-prompts.ts';

const run = promisify(execFile);

/** What the app does: seals the password with the prompt's one-time key. */
async function seal(prompt: PasswordPrompt, password: string) {
  const key = await crypto.subtle.importKey(
    'spki',
    Buffer.from(prompt.key, 'base64'),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const sealed = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, Buffer.from(password));
  return Buffer.from(sealed).toString('base64');
}

describe.skipIf(process.platform === 'win32')('sudo passwords', () => {
  it('hands the sealed answer to the asker sudo started, and to nothing else', async () => {
    // Here a shell stands in for sudo; the real check (the asker's parent is sudo as root) is Linux's.
    let trusted = true;
    const askpass = await Askpass.start(() => trusted);
    if (!askpass) return; // no sudo on this computer
    const prompts = new PasswordPrompts();
    const shown: (PasswordPrompt | undefined)[] = [];
    const ask = prompts.asker('tool-1', new AbortController().signal, (prompt) => {
      shown.push(prompt);
      if (prompt)
        void seal(prompt, 'hunter2').then((sealed) =>
          prompts.answer({ type: 'tool_password', toolId: 'tool-1', promptId: prompt.id, sealed }),
        );
    });
    const session = askpass.session(process.env.PATH, ask);
    const env = { ...process.env, ...session.env };
    try {
      const asked = await run('sh', ['-c', '"$SUDO_ASKPASS" "[sudo] password for fin:"'], { env });
      expect(asked.stdout).toBe('hunter2\n');
      expect(shown[0]?.text).toBe('[sudo] password for fin:');
      expect(shown.at(-1)).toBeUndefined();
      // sudo on the command's PATH is the one that always asks through the app.
      expect((await run('sh', ['-c', 'command -v sudo'], { env })).stdout).toContain(
        'crewstead-askpass-',
      );
      trusted = false;
      await expect(run('sh', ['-c', '"$SUDO_ASKPASS" x'], { env })).rejects.toThrow();
    } finally {
      session.end();
      await askpass.stop();
    }
  });
});
