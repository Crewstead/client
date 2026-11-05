import { app, session } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { appLink, type AppLink, type Handler } from '../../daemon/src/app-link.ts';
import { machineHome, readConfig } from '../../daemon/src/config.ts';
import { stopLeftoverServices } from './leftovers.ts';

export type ComputerState = 'off' | 'connecting' | 'connected' | 'removed';
/** The service's exit code when the hub removed this computer (daemon/src/service.ts). */
const STOPPED_FOR_GOOD = 3;

/** The bundled computer service, outside the app archive so other programs can run its helpers. */
function serviceMain() {
  const root = app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked');
  return join(root, 'build', 'daemon', 'main.mjs');
}

/**
 * This computer's service (the `daemon` package), run by the app on Electron's own Node: it keeps the
 * link to the hub open so chats can use this computer, and restarts if it stops unexpectedly.
 */
export class Computer {
  state: ComputerState = 'off';
  private child?: ChildProcess;
  private link?: AppLink;
  private stopping = false;
  constructor(
    private changed: () => void,
    /** Answers the service's requests (the browser's tabs). */
    private serve: Handler = () => undefined,
  ) {}

  /** Asks the running service, e.g. which tab shows a chat's browser. */
  ask(op: string, args?: unknown) {
    if (!this.link) return Promise.reject(new Error('This computer is not connected.'));
    return this.link.ask(op, args);
  }

  /** The hub this computer is connected to, if any. */
  connectedHub() {
    return readConfig(machineHome())?.hub;
  }

  /** Runs the service for the saved connection. */
  start() {
    if (this.connectedHub()) this.spawn(['run']);
  }

  /**
   * Stops services an earlier run of this app left behind (e.g. one an update did not stop), so only
   * this one links the computer to the hub: two would keep taking the link from each other.
   */
  async stopLeftovers() {
    await stopLeftoverServices(this.child?.pid);
  }

  /**
   * Registers this computer with `hub` as the account signed in there (no token to copy), then runs
   * the service. False when no one is signed in.
   */
  async connect(hub: string) {
    const fetch = (path: string, init?: RequestInit) =>
      session.defaultSession.fetch(`${hub}${path}`, init);
    const me = await fetch('/api/auth/session');
    if (!me.ok) return false;
    const { user, csrf } = (await me.json()) as { user: { id: string }; csrf: string };
    const created = await fetch('/api/machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-CSRF': csrf, 'X-Hub-Account': user.id },
      body: JSON.stringify({ name: hostname() }),
    });
    if (!created.ok) throw new Error(((await created.json()) as { message?: string }).message);
    const { token } = (await created.json()) as { token: string };
    this.stop();
    this.spawn(['connect', hub, '--foreground'], { HUB_MACHINE_TOKEN: token });
    return true;
  }

  /** A one-off command of the service, e.g. `allow <folder>` or `computer on`; resolves its output. */
  command(args: string[]) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [serviceMain(), ...args], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolve(output.trim()) : reject(new Error(output.trim() || `exit ${code}`)),
      );
    });
  }

  /** Restarts the service so it picks up changed settings (folders, whole computer). */
  restart() {
    this.stop();
    this.start();
  }

  stop() {
    this.stopping = true;
    this.child?.kill('SIGTERM');
    this.child = undefined;
    this.stopping = false;
    this.set('off');
  }

  private spawn(args: string[], env: Record<string, string> = {}) {
    const child = spawn(process.execPath, [serviceMain(), ...args], {
      // Its standard input stays open while this app runs; the service stops once it closes.
      env: {
        ...process.env,
        ...env,
        ELECTRON_RUN_AS_NODE: '1',
        CREWSTEAD_APP_PIPE: '1',
        // Where Chromium names its DevTools endpoint, which the service's browser tools use.
        CREWSTEAD_APP_DEVTOOLS: join(app.getPath('userData'), 'DevToolsActivePort'),
      },
      // The fourth is the channel for requests between this app and the service (app-link.ts).
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });
    this.child = child;
    this.link?.drop();
    const link = appLink((message) => child.connected && child.send(message), this.serve);
    this.link = link;
    child.on('message', (message) => link.receive(message));
    child.once('exit', () => {
      link.drop();
      if (this.link === link) this.link = undefined;
    });
    this.set('connecting');
    const read = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        console.log(line);
        if (line.includes('Connected to ')) this.set('connected');
        else if (line.includes('Lost the hub connection')) this.set('connecting');
      }
    };
    child.stdout?.on('data', read);
    child.stderr?.on('data', read);
    child.once('exit', (code) => {
      if (this.child !== child || this.stopping) return;
      this.child = undefined;
      if (code === STOPPED_FOR_GOOD) return this.set('removed');
      // Unexpected: try again shortly.
      this.set('connecting');
      setTimeout(() => this.child || this.start(), 5_000);
    });
  }

  private set(state: ComputerState) {
    this.state = state;
    this.changed();
  }
}
