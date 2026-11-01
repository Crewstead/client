import { unwatchFile, watchFile } from 'node:fs';
import { join } from 'node:path';
import type {
  MachineCommand,
  MachineToolProgress,
  MachineToolResult,
} from '@crewstead/core/protocol';
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
  return {
    /** Handles tool commands; returns false for any other command. */
    handle(command: MachineCommand) {
      if (command.type === 'cancel_tool') active.get(command.toolId)?.abort();
      else if (command.type === 'tool') {
        const controller = new AbortController();
        active.set(command.toolId, controller);
        let latest = '';
        let timer: NodeJS.Timeout | undefined;
        const onOutput = (output: string) => {
          latest = output;
          timer ??= setTimeout(() => {
            timer = undefined;
            void progress({ toolId: command.toolId, output: latest.slice(-PROGRESS_CHARS) });
          }, PROGRESS_MS);
        };
        void runProjectTool(host, command, controller.signal, onOutput)
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

/** Calls `changed` when the owner adds or removes a project, so the hub hears of it at once. */
export function watchProjects(home: string, changed: () => void) {
  const file = join(home, 'config.json');
  const listener = (now: { mtimeMs: number }, before: { mtimeMs: number }) => {
    if (now.mtimeMs !== before.mtimeMs) changed();
  };
  watchFile(file, { interval: 1_000 }, listener);
  return () => unwatchFile(file, listener);
}
