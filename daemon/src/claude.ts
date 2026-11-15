import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  claudeCodeModels,
  claudeEnvironment,
  localClaude,
  runClaude as runInCore,
  type ToolAnswer,
} from '@crewstead/core/adapter-claude-code';
import type {
  MachineChunk,
  MachineCommand,
  MachineHello,
  PlanLimits,
} from '@crewstead/core/protocol';

export type { ToolAnswer };
type Run = Extract<MachineCommand, { type: 'run' }>;

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

/**
 * Runs one reply with the unmodified program on this computer (core's runner: the hub's tools through
 * the bridge, a fresh start when they are missing), with the run's files in `cwd`.
 */
export function runClaude(
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
  return runInCore({
    host: localClaude(binary),
    folder: cwd,
    run,
    emit,
    signal,
    onToolCall,
    env,
    ...(onLimits ? { onLimits } : {}),
    log: (line) => console.log(`[crewstead] ${line}`),
  });
}
