// The only bridge from page code to the app. The first-run page submits the hub's address with
// `connect` (accepted from that page only); the hub's own pages ask to add a project on this computer
// with `addProject`, which opens the system's folder picker (accepted from the connected hub only).
// main.ts checks the sender of each.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('crewsteadDesktop', {
  connect: (address: string) => ipcRenderer.invoke('connect-hub', address) as Promise<string>,
  /** Resolves '' when a project was added, 'cancelled', or why it could not be. */
  addProject: () => ipcRenderer.invoke('add-project') as Promise<string>,
});
