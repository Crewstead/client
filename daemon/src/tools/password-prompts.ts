import { constants, generateKeyPair, privateDecrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import type { MachineCommand, PasswordPrompt } from '@crewstead/core/protocol';
import type { AskPassword } from './askpass.ts';

const makeKeys = promisify(generateKeyPair);
type Answer = Extract<MachineCommand, { type: 'tool_password' }>;

/**
 * sudo passwords asked of the owner while tool calls run. Each question gets its own key pair: the app
 * seals the password with the public half, the hub carries only the sealed text, and the private half
 * opens it here and is then dropped with the question.
 */
export class PasswordPrompts {
  private waiting = new Map<string, { toolId: string; settle: (sealed: string | null) => void }>();

  /** Asks for one tool call, one question at a time; `show` sends the prompt, or clears it. */
  asker(
    toolId: string,
    stopped: AbortSignal,
    show: (prompt?: PasswordPrompt) => void,
  ): AskPassword {
    let queue: Promise<unknown> = Promise.resolve();
    return (text, signal) => {
      const turn = queue.then(() =>
        this.ask(toolId, text, AbortSignal.any([signal, stopped]), show),
      );
      queue = turn.catch(() => null);
      return turn;
    };
  }

  /** The owner's sealed answer, from the hub; only for a question of that very tool call. */
  answer(command: Answer) {
    const question = this.waiting.get(command.promptId);
    if (question?.toolId === command.toolId) question.settle(command.sealed);
  }

  private async ask(
    toolId: string,
    text: string,
    signal: AbortSignal,
    show: (prompt?: PasswordPrompt) => void,
  ): Promise<string | null> {
    if (signal.aborted) return null;
    const keys = await makeKeys('rsa', { modulusLength: 2048 });
    const id = randomBytes(8).toString('hex');
    return new Promise((resolve) => {
      const finish = (password: string | null) => {
        this.waiting.delete(id);
        signal.removeEventListener('abort', stop);
        show(undefined);
        resolve(password);
      };
      const stop = () => finish(null);
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) return stop();
      const settle = (sealed: string | null) => {
        if (sealed === null) return finish(null);
        try {
          const password = privateDecrypt(
            { key: keys.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
            Buffer.from(sealed, 'base64'),
          ).toString('utf8');
          finish(/[\r\n]/.test(password) ? null : password);
        } catch {
          finish(null);
        }
      };
      this.waiting.set(id, { toolId, settle });
      const key = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
      show({ id, key, text });
    });
  }
}
