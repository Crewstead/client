/**
 * Slash commands for the prompt box. A command with `run` acts in the app; one without is sent as
 * the message itself for the hub to handle (e.g. /compact). Other text starting with "/" is a message.
 */
export interface Command {
  name: string;
  hint: string;
  /** Shown after the name, e.g. "<name>"; the command then needs that text. */
  args?: string;
  run?: (argument: string) => void | Promise<void>;
}

/** The command a message invokes, with what follows its name. */
export function matchCommand(text: string, commands: readonly Command[]) {
  const found = /^\/([a-z-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  const command = found && commands.find((entry) => entry.name === found[1]);
  return command ? { command, argument: (found[2] ?? '').trim() } : undefined;
}

/** Commands to suggest while the name is still being typed ("/", "/re"). */
export function suggestCommands(text: string, commands: readonly Command[]) {
  const typed = /^\/([a-z-]*)$/.exec(text)?.[1];
  if (typed === undefined) return [];
  return commands.filter((command) => command.name.startsWith(typed));
}
