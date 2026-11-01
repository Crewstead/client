import { Menu, Tray, type MenuItemConstructorOptions } from 'electron';
import type { ComputerState } from './computer.ts';

const states: Record<ComputerState, string> = {
  off: 'This computer: not used by chats',
  connecting: 'This computer: connecting…',
  connected: 'This computer: connected',
  removed: 'This computer: removed in the hub',
};

export interface TrayActions {
  show(): void;
  useComputer(): void;
  allowFolder(): void;
  wholeComputer(on: boolean): void;
  autostart(on: boolean): void;
  changeHub(): void;
  quit(): void;
}

/** The tray icon: the app keeps running there, with the computer service, when its window closes. */
export function createTray(icon: string, actions: TrayActions) {
  const tray = new Tray(icon);
  tray.setToolTip('Crewstead');
  tray.on('click', actions.show);
  const update = (state: ComputerState, autostart: boolean, whole: boolean) => {
    const computer: MenuItemConstructorOptions[] =
      state === 'off' || state === 'removed'
        ? [{ label: 'Let chats use this computer…', click: actions.useComputer }]
        : [
            { label: 'Allow a folder for projects…', click: actions.allowFolder },
            {
              label: 'Chats may use the whole computer',
              type: 'checkbox',
              checked: whole,
              click: (item) => actions.wholeComputer(item.checked),
            },
          ];
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Crewstead', click: actions.show },
        { type: 'separator' },
        { label: states[state], enabled: false },
        ...computer,
        { type: 'separator' },
        {
          label: 'Start with the computer',
          type: 'checkbox',
          checked: autostart,
          click: (item) => actions.autostart(item.checked),
        },
        { label: 'Use another hub…', click: actions.changeHub },
        { label: 'Quit Crewstead', click: actions.quit },
      ]),
    );
  };
  return { tray, update };
}
