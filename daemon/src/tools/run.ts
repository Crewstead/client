import {
  COMPUTER_PLACE,
  isBrowserTool,
  isProjectTool,
  projectToolArguments,
  type MachineCommand,
  type MachineToolResult,
  type ProjectToolArguments,
} from '@crewstead/core/protocol';
import { runBrowserTool, type BrowserPool } from '@crewstead/core/browser';
import { computerSettings } from '../computer.ts';
import { openProject } from '../projects.ts';
import { runComputerTool } from './computer.ts';
import { runCommand, type SandboxOptions } from './command.ts';
import { editProjectFile, listFiles, readProjectFile, writeProjectFile } from './files.ts';
import { searchProject } from './search.ts';

export interface ToolHost extends SandboxOptions {
  /** The daemon's settings folder, which lists the registered projects. */
  home: string;
  ripgrep?: string;
  /** Commands can run in a sandbox here. */
  sandbox?: boolean;
  /** Headless browsers for the browser tools; without one they are refused. */
  browser?: BrowserPool;
}

/**
 * Runs one project tool the hub asked for. The arguments are checked again here: the hub is trusted
 * with approval, but this computer decides what may touch its files.
 */
export async function runProjectTool(
  host: ToolHost,
  command: Extract<MachineCommand, { type: 'tool' }>,
  signal: AbortSignal,
  /** A running command's output so far. */
  onOutput?: (output: string) => void,
): Promise<MachineToolResult> {
  const result = (
    output: string,
    isError: boolean,
    diff?: string,
    image?: MachineToolResult['image'],
  ): MachineToolResult => ({
    toolId: command.toolId,
    output,
    isError,
    ...(diff ? { diff } : {}),
    ...(image ? { image } : {}),
  });
  try {
    if (!isProjectTool(command.name)) throw new Error(`Unknown tool ${command.name}.`);
    const parsed = projectToolArguments[command.name].safeParse(JSON.parse(command.arguments));
    if (!parsed.success)
      throw new Error(parsed.error.issues[0]?.message ?? 'Invalid tool arguments.');
    const args = parsed.data;
    if (command.projectId === COMPUTER_PLACE) {
      if (!isBrowserTool(command.name)) {
        const outcome = await runComputerTool(host, command, args, signal, onOutput);
        return result(outcome.output, false, outcome.diff);
      }
      const settings = computerSettings(host.home);
      if (!settings.enabled || !settings.browser)
        throw new Error('The browser is turned off for whole-computer chats.');
    }
    const project =
      command.projectId === COMPUTER_PLACE
        ? {
            id: COMPUTER_PLACE,
            path: '/',
            rules: { commands: false, network: true, browser: true },
          }
        : openProject(host.home, command.projectId);
    const root = project.path;
    // The owner's rules for this project hold whatever the hub asks.
    if (command.name === 'run_command') {
      if (!project.rules.commands) throw new Error('Commands are turned off for this project.');
      if ((args as ProjectToolArguments<'run_command'>).network && !project.rules.network)
        throw new Error('Network access is turned off for this project.');
    }
    if (isBrowserTool(command.name)) {
      if (!project.rules.browser) throw new Error('The browser is turned off for this project.');
      if (!host.browser) throw new Error('No browser is installed on this computer.');
      if (command.preview) return result('', false);
      const key = `${project.id}:${command.session ?? ''}`;
      const { output, image } = await runBrowserTool(
        host.browser,
        key,
        command.name,
        args,
        project.rules.network,
        signal,
      );
      return result(output, false, undefined, image);
    }
    const apply = !command.preview;
    let outcome: { output: string; diff?: string };
    switch (command.name) {
      case 'edit_file':
        outcome = await editProjectFile(root, args as ProjectToolArguments<'edit_file'>, apply);
        break;
      case 'write_file':
        outcome = await writeProjectFile(root, args as ProjectToolArguments<'write_file'>, apply);
        break;
      default:
        if (!apply) return result('', false);
        if (command.name === 'list_files')
          outcome = await listFiles(root, args as ProjectToolArguments<'list_files'>);
        else if (command.name === 'read_file')
          outcome = await readProjectFile(root, args as ProjectToolArguments<'read_file'>);
        else if (command.name === 'search_files')
          outcome = await searchProject(
            root,
            args as ProjectToolArguments<'search_files'>,
            signal,
            host.ripgrep,
          );
        else
          outcome = await runCommand(
            root,
            args as ProjectToolArguments<'run_command'>,
            signal,
            host,
            onOutput,
          );
    }
    return result(outcome.output, false, outcome.diff);
  } catch (error) {
    signal.throwIfAborted();
    return result(error instanceof Error ? error.message : 'The tool failed.', true);
  }
}
