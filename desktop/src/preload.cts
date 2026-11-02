// The only bridge from page code to the app. The first-run page submits the hub's address with
// `connect` (accepted from that page only); the hub's own pages ask to add a project on this computer
// with `addProject`, which opens the system's folder picker, and follow and install the app's
// updates with `updates` (both accepted from the connected hub only).
// main.ts checks the sender of each.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('crewsteadDesktop', {
  connect: (address: string) => ipcRenderer.invoke('connect-hub', address) as Promise<string>,
  /** Resolves '' when a project was added, 'cancelled', or why it could not be. */
  addProject: () => ipcRenderer.invoke('add-project') as Promise<string>,
  /** This computer's id at the hub, when the app's computer service is connected to it. */
  thisComputer: () => ipcRenderer.invoke('this-computer') as Promise<string | undefined>,
  /** Turns a whole-computer setting of this computer on or off; '' or why it could not. */
  computerSetting: (key: 'enabled' | 'commands' | 'browser', on: boolean) =>
    ipcRenderer.invoke('computer-setting', key, on) as Promise<string>,
  /** Calls `listener` when this computer's link to the hub changes (e.g. 'connected'). */
  onComputerState: (listener: (state: string) => void) => {
    const forward = (_event: unknown, state: string) => listener(state);
    ipcRenderer.on('computer-state', forward);
    return () => void ipcRenderer.off('computer-state', forward);
  },
  /** The app's updates: what is known, a check now, the restart that installs one, and changes. */
  updates: {
    state: () => ipcRenderer.invoke('update-state') as Promise<unknown>,
    check: () => ipcRenderer.invoke('update-check') as Promise<unknown>,
    restart: () => ipcRenderer.invoke('update-restart') as Promise<void>,
    onChange: (listener: (state: unknown) => void) => {
      const forward = (_event: unknown, state: unknown) => listener(state);
      ipcRenderer.on('update-state', forward);
      return () => void ipcRenderer.off('update-state', forward);
    },
  },
});
