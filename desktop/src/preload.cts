// The only bridge from page code to the app: the first-run page submits the hub's address with it.
// The app accepts it from its own setup page only (main.ts checks the sender), never from a hub page.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('crewsteadDesktop', {
  connect: (address: string) => ipcRenderer.invoke('connect-hub', address) as Promise<string>,
});
