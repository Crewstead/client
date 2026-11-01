import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { serverEvents } from '@crewstead/core/provider-kit';
import type {
  MachineActionResult,
  MachineChunk,
  MachineCommand,
  MachineHello,
  MachineReport,
} from '@crewstead/core/protocol';
import { detectClaudeCode, runClaude } from './claude.ts';
import { computerHello } from './computer.ts';
import type { MachineConfig } from './config.ts';
import { listFolders, projectAction } from './folders.ts';
import { browserLink, isBrowserAction } from './browser-link.ts';
import { projectCommands, watchProjects } from './project-link.ts';
import { watchCommands } from './watch-link.ts';
import { listProjects } from './projects.ts';
import type { ToolHost } from './tools/run.ts';
import type { ToolAnswer } from './tool-bridge.ts';

/** A reply in progress, and the tool calls it is waiting on (by call id). */
interface ActiveRun {
  controller: AbortController;
  waiting: Map<string, (answer: ToolAnswer) => void>;
  /** An approval check, which may run beside the reply it checks. */
  review: boolean;
}

const FLUSH_MS = 100;
const RETRY_MAX_MS = 30_000;
export const DAEMON_VERSION = '0.1.0';

export interface LinkOptions {
  config: MachineConfig;
  claude: string;
  work: string;
  log: (line: string) => void;
  signal: AbortSignal;
  /** Where project tools run, and whether commands can run in a sandbox here. */
  tools: ToolHost & { sandbox: boolean };
}

/** Thrown when the hub no longer accepts this computer's token; reconnecting cannot help. */
export class Disconnected extends Error {}

/**
 * Keeps one outbound connection to the hub: says hello, then runs the commands it streams back.
 * Reconnects with growing delays. Only one reply runs at a time on a computer, plus
 * one approval check of a tool call it waits on.
 */
export async function keepLinked(options: LinkOptions) {
  let delay = 1_000;
  while (!options.signal.aborted) {
    try {
      await linkOnce(options, () => (delay = 1_000));
    } catch (error) {
      if (error instanceof Disconnected) throw error;
      if (options.signal.aborted) return;
      options.log(`Lost the hub connection (${error instanceof Error ? error.message : error}).`);
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, RETRY_MAX_MS);
  }
}

async function linkOnce(options: LinkOptions, connected: () => void) {
  const { config, signal } = options;
  const headers = { Authorization: `Bearer ${config.token}` };
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(`${config.hub}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (response.status === 401) throw new Disconnected('The hub removed this computer.');
    if (!response.ok) throw new Error(`hub answered ${response.status}`);
    return response;
  };
  const hello = async (): Promise<MachineHello> => ({
    name: hostname().slice(0, 80) || 'Computer',
    version: DAEMON_VERSION,
    claudeCode: await detectClaudeCode(options.claude),
    projects: listProjects(options.tools.home),
    sandbox: options.tools.sandbox,
    folders: listFolders(options.tools.home),
    browser: !!options.tools.browser,
    computer: computerHello(options.tools.home, !!options.tools.browser),
  });
  const first = await hello();
  await call('/api/machine/hello', first);
  const stream = await call('/api/machine/link');
  connected();
  const unwatch = watchProjects(options.tools.home, () => {
    void hello()
      .then((value) => call('/api/machine/hello', value))
      .then(() => options.log('Sent the updated project list to the hub.'))
      .catch(() => {});
  });
  const projects = projectCommands(
    options.tools,
    async (result) => {
      await call('/api/machine/tool-results', result).catch(() => {});
    },
    async (update) => {
      await call('/api/machine/tool-progress', update).catch(() => {});
    },
  );
  options.log(
    `Connected to ${config.hub} as ${first.name}.` +
      (first.claudeCode
        ? ` Claude Code ${first.claudeCode.version} available.`
        : ' Claude Code not found.') +
      ` ${first.projects.length} project${first.projects.length === 1 ? '' : 's'}.`,
  );
  const watches = watchCommands(options.tools, (body) =>
    call('/api/machine/watch-events', body).then(
      () => undefined,
      () => undefined,
    ),
  );
  const browsers = browserLink(options.tools.browser, (body) =>
    call('/api/machine/browser-events', body).then(() => undefined),
  );
  const runs = new Map<string, ActiveRun>();
  const report = (body: MachineReport) => call('/api/machine/reports', body).catch(() => {});
  // Project changes from the hub: the new list is sent before the answer, so the hub has it.
  const act = async (command: Extract<MachineCommand, { type: 'project_action' }>) => {
    let answer: MachineActionResult;
    try {
      const { action } = command;
      if (isBrowserAction(action))
        answer = { requestId: command.requestId, ...(await browsers.answer(action)) };
      else {
        const result = projectAction(options.tools.home, action);
        if (action.kind !== 'browse')
          await call('/api/machine/hello', await hello()).catch(() => {});
        answer = { requestId: command.requestId, ...result };
      }
    } catch (error) {
      answer = {
        requestId: command.requestId,
        error: (error instanceof Error ? error.message : 'That did not work.').slice(0, 500),
      };
    }
    await call('/api/machine/action-results', answer).catch(() => {});
  };
  // Cleaned up however the link ends, so reconnecting never leaves watchers or runs behind.
  try {
    for await (const event of serverEvents(stream.body!)) {
      if (event.event !== 'command') continue;
      const command = JSON.parse(event.data) as MachineCommand;
      if (projects.handle(command) || browsers.handle(command) || watches.handle(command)) continue;
      if (command.type === 'tool' || command.type === 'cancel_tool') continue;
      if (command.type === 'watch' || command.type === 'watch_stop') continue;
      if (command.type === 'browser_watch' || command.type === 'browser_unwatch') continue;
      if (command.type === 'project_action') {
        void act(command);
        continue;
      }
      if (command.type === 'cancel') {
        // Its place frees at once, as on the hub; the process ends on its own just after.
        runs.get(command.runId)?.controller.abort();
        runs.delete(command.runId);
      } else if (command.type === 'tool_result') {
        const waiting = runs.get(command.runId)?.waiting;
        waiting?.get(command.callId)?.({
          text: command.output,
          isError: command.isError,
          ...(command.images?.length ? { images: command.images } : {}),
        });
        waiting?.delete(command.callId);
      } else if (busy(runs, command))
        void report({
          runId: command.runId,
          chunks: [],
          error: `Busy with ${MAX_REPLIES} other replies.`,
        });
      else {
        const run: ActiveRun = {
          controller: new AbortController(),
          waiting: new Map(),
          review: !!command.review,
        };
        runs.set(command.runId, run);
        void execute(options, command, report, run).finally(() => runs.delete(command.runId));
      }
    }
  } finally {
    for (const run of runs.values()) run.controller.abort();
    projects.stop();
    browsers.stop();
    watches.stop();
    unwatch();
    await options.tools.browser?.closeAll();
  }
  throw new Error('the hub closed the connection');
}

/**
 * A few replies at once (a chat may prompt another while its own reply waits on that tool call), each
 * its own Claude Code process, plus as many approval checks beside them.
 */
export const MAX_REPLIES = 8;
function busy(runs: Map<string, ActiveRun>, command: Extract<MachineCommand, { type: 'run' }>) {
  const active = [...runs.values()].filter((run) => run.review === !!command.review);
  return active.length >= MAX_REPLIES;
}

/**
 * Runs one reply, sending output in small batches so the hub sees it while it is written. A hub tool
 * call is sent with `paused`; the model waits until the hub answers with a `tool_result` command.
 */
async function execute(
  options: LinkOptions,
  run: Extract<MachineCommand, { type: 'run' }>,
  report: (body: MachineReport) => Promise<unknown>,
  active: ActiveRun,
) {
  const signal = active.controller.signal;
  let pending: MachineChunk[] = [];
  let sending = Promise.resolve<unknown>(undefined);
  const flush = (end?: { done?: boolean; paused?: boolean; error?: string }) => {
    const chunks = pending;
    pending = [];
    sending = sending.then(() => report({ runId: run.runId, chunks, ...end }));
    return sending;
  };
  const timer = setInterval(() => pending.length && void flush(), FLUSH_MS);
  try {
    const onToolCall = (name: string, args: string) => {
      const callId = randomUUID();
      pending.push({ type: 'tool_call', callId, name, arguments: args });
      void flush({ paused: true });
      return new Promise<ToolAnswer>((resolve) => active.waiting.set(callId, resolve));
    };
    signal.addEventListener('abort', () => {
      for (const resolve of active.waiting.values()) resolve({ text: 'Stopped.', isError: true });
    });
    await runClaude(
      options.claude,
      options.work,
      run,
      (chunk) => pending.push(chunk),
      signal,
      onToolCall,
    );
    clearInterval(timer);
    await flush({ done: true });
  } catch (error) {
    clearInterval(timer);
    if (signal.aborted) return;
    await flush({ error: error instanceof Error ? error.message : 'Claude Code failed.' });
  }
}
