import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dataHome = () => process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share');

/**
 * Linux: lists the app in the app launcher. An AppImage is one file that nothing installs, so the
 * app writes its own entry and icon, again at each start (the file may have moved). The entry's name
 * matches the app's Wayland id (`crewstead`), so its windows get its icon too. Elsewhere the
 * installers do this.
 */
export function addToLauncher(icon: string) {
  const program = process.env.APPIMAGE;
  if (process.platform !== 'linux' || !program) return;
  try {
    const icons = join(dataHome(), 'icons/hicolor/256x256/apps');
    mkdirSync(icons, { recursive: true });
    writeFileSync(join(icons, 'crewstead.png'), readFileSync(icon));
    const entries = join(dataHome(), 'applications');
    mkdirSync(entries, { recursive: true });
    writeFileSync(
      join(entries, 'crewstead.desktop'),
      [
        '[Desktop Entry]',
        'Type=Application',
        'Name=Crewstead',
        'Comment=Your Crewstead hub, with this computer built in',
        `Exec="${program}" %U`,
        'Icon=crewstead',
        'Terminal=false',
        'Categories=Development;',
        'StartupWMClass=Crewstead',
        '',
      ].join('\n'),
    );
  } catch {
    // Without a launcher entry the app still runs; it tries again next start.
  }
}
