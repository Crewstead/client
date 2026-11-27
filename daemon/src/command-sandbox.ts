import { sandboxAvailable } from './tools/command.ts';
import {
  ownerSid,
  setUpWindowsSandbox,
  windowsSandbox,
  type WindowsSandbox,
} from './tools/sandbox-windows.ts';

/** Where commands run on this computer: bubblewrap on Linux, crewstead-sandbox.exe on Windows. */
export function commandSandbox(home: string): { sandbox: boolean; windows?: WindowsSandbox } {
  if (process.platform !== 'win32') return { sandbox: sandboxAvailable() };
  const windows = windowsSandbox(home);
  return windows ? { sandbox: true, windows } : { sandbox: false };
}

/** The sandbox, as `crewstead status` describes it. */
export function sandboxLine(home: string) {
  const { sandbox, windows } = commandSandbox(home);
  if (windows === 'users')
    return 'Windows sandbox users (no reading your files; network only when asked)';
  if (windows === 'restricted')
    return 'Windows, writes only in the project (crewstead sandbox setup isolates them fully)';
  if (sandbox) return 'bubblewrap';
  return process.platform === 'win32'
    ? 'none: commands run as you, each one approved'
    : 'none: commands run as you, each one approved (install bubblewrap to isolate them)';
}

/** `crewstead sandbox setup|remove`: Windows asks for an administrator once (UAC). */
export async function sandboxCommand(home: string, [what]: string[]) {
  if (process.platform !== 'win32')
    return 'Only Windows needs this; on Linux commands run in bubblewrap.';
  if (what !== 'setup' && what !== 'remove')
    throw new Error('Usage: crewstead sandbox setup|remove');
  await setUpWindowsSandbox(home, what === 'setup' ? ownerSid() : '', what === 'remove');
  return what === 'setup'
    ? 'Set up: commands now run as a hidden sandbox user. Restart the service to use it (crewstead restart).'
    : 'Removed the sandbox users and their firewall rules.';
}
