import { statSync, unwatchFile, watchFile } from 'node:fs';
import { join } from 'node:path';
import type {
  MachineCommand,
  MachineToolProgress,
  MachineToolResult,
  PasswordPrompt,
} from '@crewstead/core/protocol';
import { PasswordPrompts } from './tools/password-prompts.ts';
import { runProjectTool, type ToolHost } from './tools/run.ts';

/**
 * The project half of the hub link: runs the tool calls the hub sends (several may run at once, e.g.
 * reads during a reply) and stops one when the hub cancels it.
 */
/** How often a running command's output is sent, and how much of its end. */
const PROGRESS_MS = 500;
const PROGRESS_CHARS = 8_000;

export function projectCommands(
  host: ToolHost,
  post: (result: MachineToolResult) => Promise<void>,
  progress: (update: MachineToolProgress) => Promise<void>,
) {
  const active = new Map<string, AbortController>();
  const prompts = new PasswordPrompts();
  return {
    /** Handles tool commands; returns false for any other command. */
    handle(command: MachineCommand) {
      if (command.type === 'cancel_tool') active.get(command.toolId)?.abort();
      else if (command.type === 'tool_password') prompts.answer(command);
      else if (command.type === 'tool') {
        const controller = new AbortController();
        active.set(command.toolId, controller);
        let latest = '';
        let asking: PasswordPrompt | undefined;
        let timer: NodeJS.Timeout | undefined;
        const send = () => {
          clearTimeout(timer);
          timer = undefined;
          void progress({
            toolId: command.toolId,
            output: latest.slice(-PROGRESS_CHARS),
            ...(asking ? { password: asking } : {}),
          });
        };
        const onOutput = (output: string) => {
          latest = output;
          timer ??= setTimeout(send, PROGRESS_MS);
        };
        // A sudo question shows at once, and goes away as soon as it is answered.
        const askPassword = prompts.asker(command.toolId, controller.signal, (prompt) => {
          asking = prompt;
          send();
        });
        void runProjectTool(host, command, controller.signal, onOutput, askPassword)
          .then(post, () => undefined)
          .finally(() => {
            clearTimeout(timer);
            active.delete(command.toolId);
          });
      } else return false;
      return true;
    },
    stop() {
      for (const controller of active.values()) controller.abort();
    },
  };
}

/** When the settings (projects, folders) last changed. */
export const settingsTime = (home: string) =>
  statSync(join(home, 'config.json'), { throwIfNoEntry: false })?.mtimeMs;

/**
 * Calls `changed` when the owner adds or removes a project, so the hub hears of it at once. A change
 * since `since` (made while the link was connecting, before this watch began) is reported at once too.
 */
export function watchProjects(home: string, changed: () => void, since = settingsTime(home)) {
  const file = join(home, 'config.json');
  const listener = (now: { mtimeMs: number }, before: { mtimeMs: number }) => {
    if (now.mtimeMs !== before.mtimeMs) changed();
  };
  watchFile(file, { interval: 1_000 }, listener);
  if (settingsTime(home) !== since) changed();
  return () => unwatchFile(file, listener);
}
