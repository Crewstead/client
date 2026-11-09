#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { appBrowser } from './app-browser.ts';
import { claudeBinary } from './claude.ts';
import {
  computerCommand,
  computerSettings,
  describeComputer,
  terminalCommand,
} from './computer.ts';
import {
  hubDataFolder,
  hubUrl,
  machineHome,
  readConfig,
  workFolder,
  writeConfig,
} from './config.ts';
import { allowFolder, disallowFolder, listFolders } from './folders.ts';
import { Disconnected, keepLinked } from './link.ts';
import { addProject, listProjects, removeProject } from './projects.ts';
import {
  followLogs,
  install,
  restartIfInstalled,
  serviceState,
  STOPPED_FOR_GOOD,
  uninstall,
} from './service.ts';
import { sandboxAvailable } from './tools/command.ts';

const HELP = `Crewstead on this computer

  crewstead connect <hub address>   Connect to a hub (asks for the token from its Settings) and run
                                    in the background; add --foreground to run in this terminal
  crewstead status                  Hub, background service, projects and allowed folders
  crewstead allow <folder>          Let the hub add projects inside this folder
  crewstead disallow <folder>       Stop that (projects already added stay)
  crewstead add <folder> [name]     Add a project here
  crewstead remove <name>           Remove a project (its files stay)
  crewstead computer on|off         Let chats work on this whole computer as you (they ask first);
                                    computer commands|browser on|off narrows it
  crewstead terminal on|off         Let you open shells here from Crewstead (in projects, and
                                    on the whole computer when that is on)
  crewstead install-browser         Download the headless browser again (install does it once)
  crewstead logs                    Follow the background service's log
  crewstead restart                 Restart the background service
  crewstead install | uninstall     Add or remove the command and background service
  crewstead run                     Run in this terminal instead of in the background`;

const log = (line: string) => console.log(line);

/** Folders are chosen here, at the computer, so the hub only reaches what its owner picked. */
async function main([command = 'status', ...args]: string[]) {
  const home = machineHome();
  const rest = args.join(' ');
  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      return log(HELP);
    case 'status':
      return status(home, await import('@crewstead/core/browser'));
    case 'connect':
      return connect(home, args[0], args.includes('--foreground'));
    case 'run':
      return run(home);
    case 'install': {
      await ensureBrowser();
      const paths = install(home, !!readConfig(home));
      log(`Installed the crewstead command (${paths.command}) and the background service.`);
      return log(
        readConfig(home)
          ? 'It is running now and starts with this computer.'
          : 'Connect it: crewstead connect <hub address>',
      );
    }
    case 'uninstall':
      uninstall();
      return log('Removed the crewstead command and the background service. Settings were kept.');
    case 'install-browser':
      return installBrowser();
    case 'logs':
      return followLogs();
    case 'restart':
      return log(restartIfInstalled() ? 'Restarted.' : 'The background service is not installed.');
    case 'allow':
    case 'allow-folder': {
      const folder = allowFolder(home, required(args[0], 'allow <folder>'));
      return log(`Allowed ${folder.path}. Add projects inside it from the hub's Settings.`);
    }
    case 'disallow':
    case 'disallow-folder': {
      const folder = disallowFolder(home, required(rest, 'disallow <folder>'));
      return log(`The hub can no longer browse ${folder.path}. Projects added from it stay.`);
    }
    case 'add':
    case 'add-project': {
      const project = addProject(home, required(args[0], 'add <folder> [name]'), args[1]);
      return log(`Added ${project.name} (${project.path}).`);
    }
    case 'computer':
      // The running service sees the change and tells the hub.
      return log(`Whole-computer chats: ${computerCommand(home, args)}`);
    case 'terminal':
      return log(`Terminals from Crewstead: ${terminalCommand(home, args)}`);
    case 'remove':
    case 'remove-project':
      return log(
        `Removed ${removeProject(home, required(rest, 'remove <name>')).name}. Its files stay.`,
      );
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

function required(value: string | undefined, usage: string) {
  if (!value) throw new Error(`Usage: crewstead ${usage}`);
  return value;
}

/** `browser` is loaded only by the commands that need it, so quick commands start fast. */
type BrowserModule = typeof import('@crewstead/core/browser');

function status(home: string, { browserInstalled }: BrowserModule) {
  const config = readConfig(home);
  const service = serviceState();
  log(HELP.split('\n')[0]!);
  log(`  Hub:       ${config ? config.hub : 'not connected (crewstead connect <hub address>)'}`);
  log(
    `  Service:   ${
      !service
        ? 'not available here (use crewstead run)'
        : !service.installed
          ? 'not installed (crewstead install)'
          : service.running
            ? 'running in the background'
            : 'stopped (crewstead logs shows why; crewstead restart)'
    }`,
  );
  log(`  Sandbox:   ${sandboxAvailable() ? 'bubblewrap, commands allowed' : 'none, no commands'}`);
  log(
    `  Browser:   ${browserInstalled() ? "Chromium (headless; the app's own browser when run by the app)" : 'not installed (crewstead install-browser)'}`,
  );
  const projects = listProjects(home);
  log(`  Projects:  ${projects.length ? '' : 'none'}`);
  for (const project of projects)
    log(
      `    ${project.name}  ${project.path}${project.rules.commands ? '' : '  (no commands)'}${
        project.rules.commands && !project.rules.network ? '  (no network)' : ''
      }${project.rules.commands && project.rules.git ? '  (Git)' : ''}`,
    );
  log(`  Computer:  ${describeComputer(computerSettings(home))}`);
  const folders = listFolders(home);
  log(`  Allowed:   ${folders.length ? '' : 'none (crewstead allow <folder>)'}`);
  for (const folder of folders) log(`    ${folder.path}`);
  log('\ncrewstead help lists the commands.');
}

/** Saves the token, then runs in the background where possible, or in this terminal. */
async function connect(home: string, address: string | undefined, foreground: boolean) {
  const hub = hubUrl(required(address, 'connect <hub address>'));
  const token = process.env.HUB_MACHINE_TOKEN ?? (await ask('Paste the token from Settings: '));
  if (!/^ahm_[A-Za-z0-9_-]{43}$/.test(token.trim()))
    throw new Error('That is not a computer token.');
  writeConfig(home, { ...readConfig(home), hub, token: token.trim() });
  await ensureBrowser();
  if (!foreground && serviceState()) {
    install(home, true);
    return log('Connected. Running in the background and starting with this computer.');
  }
  log('Saved. Connecting…');
  return run(home);
}

async function run(home: string) {
  const config = readConfig(home);
  if (!config) {
    process.exitCode = STOPPED_FOR_GOOD;
    throw new Error('Not connected yet. Run: crewstead connect <hub address>');
  }
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => controller.abort());
  // Run by the desktop app, which holds our standard input open: when the app ends, however it ends,
  // the pipe closes and this service stops too, instead of staying behind beside the next one.
  if (process.env.CREWSTEAD_APP_PIPE === '1') {
    process.stdin.once('close', () => controller.abort());
    process.stdin.resume();
    // Stopped another way (the app's SIGTERM): the open pipe must not keep this process alive.
    controller.signal.addEventListener('abort', () => process.stdin.destroy(), { once: true });
  }
  const { BrowserPool, browserInstalled } = await import('@crewstead/core/browser');
  // Run by the desktop app, the browser is the app's: tabs in its window, sign-ins kept there.
  const app = appBrowser();
  const browser = app
    ? new BrowserPool({ host: app.host })
    : browserInstalled()
      ? new BrowserPool()
      : undefined;
  if (app && browser) app.serve(browser);
  try {
    await keepLinked({
      config,
      claude: claudeBinary(),
      work: workFolder(home),
      log: (line) => log(`[crewstead] ${line}`),
      tools: { home, sandbox: sandboxAvailable(), hidden: [home, hubDataFolder()], browser },
      signal: controller.signal,
    });
  } catch (error) {
    if (!(error instanceof Disconnected)) throw error;
    process.exitCode = STOPPED_FOR_GOOD;
    throw new Error(`${error.message} Connect it again from the hub's Settings.`, { cause: error });
  }
}

/** Setting up includes the headless browser, so no separate step is needed; a failed download only warns. */
async function ensureBrowser() {
  const browser = await import('@crewstead/core/browser');
  if (browser.browserInstalled()) return;
  log('Downloading the headless browser for the browser tools (once)…');
  try {
    browser.installBrowser();
  } catch {
    log(
      'The browser did not download; the browser tools stay off. Try again: crewstead install-browser',
    );
  }
}

/** Playwright's pinned Chromium, kept in its own cache folder outside any project. */
async function installBrowser() {
  (await import('@crewstead/core/browser')).installBrowser();
  log(restartIfInstalled() ? 'Installed. Restarted the service to use it.' : 'Installed.');
}

async function ask(question: string) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await prompt.question(question);
  } finally {
    prompt.close();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode ||= 1;
  // Run by the desktop app, its open pipe and channel would keep a failed service alive and silent;
  // ending lets the app start it again.
  if (process.env.CREWSTEAD_APP_PIPE === '1') process.exit();
});
