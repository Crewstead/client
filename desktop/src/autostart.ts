import { app } from 'electron';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const desktopFile = () =>
  join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'autostart', 'crewstead.desktop');

/** Starts the app with the computer, hidden in the tray, so chats can use it while no window is open. */
export function setAutostart(on: boolean) {
  if (process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
    return;
  }
  // Linux: an autostart entry; only an AppImage has a stable path to start.
  const program = process.env.APPIMAGE;
  if (!on || !program) {
    if (existsSync(desktopFile())) rmSync(desktopFile());
    return;
  }
  mkdirSync(join(desktopFile(), '..'), { recursive: true });
  writeFileSync(
    desktopFile(),
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Crewstead',
      `Exec="${program}" --hidden`,
      'Icon=crewstead',
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n'),
  );
}
