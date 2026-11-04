import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  HUB_SERVER,
  claudeArgs,
  claudeCodeModels,
  claudeEnvironment,
  lines,
  parseClaudeStream,
  streamJsonInput,
  streamJsonParts,
} from '@crewstead/core/adapter-claude-code';
import type {
  MachineChunk,
  MachineCommand,
  MachineHello,
  PlanLimits,
} from '@crewstead/core/protocol';
import { openToolBridge, type ToolAnswer } from './tool-bridge.ts';

type Run = Extract<MachineCommand, { type: 'run' }>;
const STOP_GRACE_MS = 5_000;

/** The `claude` program to run: the one on PATH unless HUB_CLAUDE_BIN names another. */
export const claudeBinary = (env = process.env) => env.HUB_CLAUDE_BIN || 'claude';

/** Reports Claude Code when it is installed. Only `--version` runs; nothing is signed in or read. */
export async function detectClaudeCode(binary: string): Promise<MachineHello['claudeCode']> {
  try {
    const { stdout } = await promisify(execFile)(binary, ['--version'], {
      timeout: 15_000,
      env: claudeEnvironment(process.env),
    });
    return { version: stdout.trim().slice(0, 80), models: claudeCodeModels };
  } catch {
    return null;
  }
}

/** Claude Code started without the hub's tools, so the model would wrongly say it has none. */
class NoHubTools extends Error {}

/**
 * Passes Claude Code's output on, first checking its start report: with hub tools offered, the hub's
 * MCP server must be connected and its tools listed. Throws NoHubTools before anything is written.
 */
async function* withHubTools(input: AsyncIterable<string>, expected: boolean) {
  let checked = !expected;
  for await (const line of input) {
    if (!checked && line.includes('"init"')) {
      let event: {
        subtype?: string;
        tools?: string[];
        mcp_servers?: { name: string; status: string }[];
      };
      try {
        event = JSON.parse(line) as typeof event;
      } catch {
        event = {};
      }
      if (event.subtype === 'init') {
        checked = true;
        const status = event.mcp_servers?.find((server) => server.name === HUB_SERVER)?.status;
        const listed = event.tools?.some((name) => name.startsWith(`mcp__${HUB_SERVER}__`));
        if (status !== 'connected' || !listed)
          throw new NoHubTools(
            `Claude Code started without Crewstead's tools (their server was ${status ?? 'missing'}).`,
          );
      }
    }
    yield line;
  }
}

/**
 * Runs one reply with the unmodified program. When Claude Code starts without the hub's tools, it is
 * stopped before it writes anything and started once more; a second miss fails the reply plainly.
 */
export async function runClaude(...args: Parameters<typeof runOnce>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runOnce(...args);
    } catch (error) {
      if (!(error instanceof NoHubTools) || args[4].aborted) throw error;
      if (attempt >= 2)
        throw new Error(`${error.message} Try again; if it keeps happening, restart Crewstead.`, {
          cause: error,
        });
      console.log(`[crewstead] ${error.message} Starting it again.`);
    }
  }
}

/**
 * Runs one reply with the unmodified program in its own process group, so stopping it stops
 * everything it started. Output is parsed as it arrives; standard error is kept for error messages.
 */
async function runOnce(
  binary: string,
  cwd: string,
  run: Run,
  emit: (chunk: MachineChunk) => void,
  signal: AbortSignal,
  /** Called for each hub tool the model uses; resolves with the hub's result. */
  onToolCall: (name: string, args: string) => Promise<ToolAnswer>,
  /** Claude Code's environment, which names the account's folder. */
  env: NodeJS.ProcessEnv = claudeEnvironment(process.env),
  /** The account's usage limits, when Claude Code reports them. */
  onLimits?: (limits: PlanLimits) => void,
) {
  const bridge = run.tools.length ? await openToolBridge(cwd, run.tools, onToolCall) : undefined;
  const child = spawn(binary, claudeArgs(run, bridge?.config), {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text: string) => (stderr = (stderr + text).slice(-2_000)));
  const exited = new Promise<number | null>((resolve) => {
    child.once('error', () => resolve(null));
    child.once('close', (code) => resolve(code));
  });
  const stop = () => {
    const kill = (sig: NodeJS.Signals) => {
      try {
        if (child.pid && process.platform !== 'win32') process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch {
        /* already gone */
      }
    };
    kill('SIGTERM');
    setTimeout(() => kill('SIGKILL'), STOP_GRACE_MS).unref();
  };
  signal.addEventListener('abort', stop, { once: true });
  // Pipes may reset when Claude Code is stopped; how it ended comes from its exit, below.
  for (const pipe of [child.stdin, child.stdout, child.stderr]) pipe.on('error', () => {});
  child.stdin.end(
    run.parts?.length
      ? streamJsonParts(run.parts, run.images ?? [])
      : run.images?.length
        ? streamJsonInput(run.prompt, run.images)
        : run.prompt,
  );
  try {
    const output = withHubTools(lines(child.stdout), !!bridge);
    for await (const chunk of parseClaudeStream(output, onLimits)) emit(chunk);
  } catch (error) {
    if (error instanceof NoHubTools) {
      stop();
      throw error;
    }
    const code = await exited;
    if (signal.aborted) throw new Error('Stopped.', { cause: error });
    if (code === null)
      throw new Error(`Could not start Claude Code (${binary}). Is it installed?`, {
        cause: error,
      });
    const detail = stderr.trim().split('\n').at(-1);
    throw new Error(
      error instanceof Error && !error.message.startsWith('Claude Code stopped')
        ? error.message
        : `Claude Code stopped before finishing the reply.${detail ? ` ${detail}` : ''}`,
      { cause: error },
    );
  } finally {
    signal.removeEventListener('abort', stop);
    void exited.then(() => bridge?.close());
  }
  await exited;
}
