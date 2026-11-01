import { randomBytes } from 'node:crypto';
import { readdirSync, realpathSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import type {
  FolderEntry,
  MachineFolder,
  MachineProject,
  ProjectAction,
  ProjectRules,
} from '@crewstead/core/protocol';
import { changeComputer } from './computer.ts';
import { readConfig, writeConfig } from './config.ts';
import { addProject, projectRoot, removeProject } from './projects.ts';

const LISTING_LIMIT = 500;

function config(home: string) {
  const value = readConfig(home);
  if (!value) throw new Error('Not set up yet. Run: crewstead connect <hub address>');
  return value;
}

/** Allows the hub to browse this folder and add projects inside it. Only done at the computer. */
export function allowFolder(home: string, path: string, name?: string): MachineFolder {
  const current = config(home);
  const root = projectRoot(path);
  const folders = current.folders ?? [];
  if (folders.some((folder) => folder.path === root)) throw new Error(`Already allowed: ${root}`);
  const folder = {
    id: randomBytes(6).toString('hex'),
    name: (name ?? basename(root)).trim().slice(0, 80) || 'Folder',
    path: root,
  };
  writeConfig(home, { ...current, folders: [...folders, folder] });
  return folder;
}

/** Stops the hub browsing a folder. Projects already added from it stay. */
export function disallowFolder(home: string, which: string): MachineFolder {
  const current = config(home);
  const folders = current.folders ?? [];
  const found = folders.find((folder) => [folder.id, folder.name, folder.path].includes(which));
  if (!found) throw new Error(`No allowed folder called ${which}.`);
  writeConfig(home, { ...current, folders: folders.filter((folder) => folder !== found) });
  return found;
}

export function listFolders(home: string): MachineFolder[] {
  return readConfig(home)?.folders ?? [];
}

/**
 * A folder inside an allowed one, resolved through links now: it must still be inside, and be a
 * folder that may be a project (not a system or private settings folder).
 */
function inside(home: string, folderId: string, path: string) {
  const folder = listFolders(home).find((entry) => entry.id === folderId);
  if (!folder) throw new Error('That folder is no longer allowed on this computer.');
  const base = projectRoot(folder.path);
  const target = projectRoot(join(base, path));
  if (target !== base && !target.startsWith(base + sep))
    throw new Error('That folder is outside the allowed folder.');
  return target;
}

/** Sub-folders, without hidden ones; private settings folders are never listed. */
function browse(home: string, folderId: string, path: string) {
  const target = inside(home, folderId, path);
  const projects = new Set((readConfig(home)?.projects ?? []).map((project) => project.path));
  const entries: FolderEntry[] = [];
  let more = false;
  const names = readdirSync(target, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of names) {
    let real: string;
    try {
      real = realpathSync(join(target, entry.name));
      projectRoot(real);
    } catch {
      continue; // Files, broken links, and folders that may not be projects.
    }
    if (relative(target, real).startsWith('..')) continue; // Links that lead elsewhere.
    if (entries.length === LISTING_LIMIT) {
      more = true;
      break;
    }
    entries.push({ name: entry.name, project: projects.has(real) });
  }
  return { entries, ...(more ? { more } : {}) };
}

/** Changes a project's name or rules. */
export function updateProject(
  home: string,
  id: string,
  patch: { name?: string; rules?: Partial<ProjectRules> },
): MachineProject {
  const current = config(home);
  const projects = current.projects ?? [];
  const found = projects.find((project) => project.id === id);
  if (!found) throw new Error('This project is no longer on this computer.');
  const next = {
    ...found,
    ...(patch.name ? { name: patch.name } : {}),
    rules: { ...found.rules, ...patch.rules },
  };
  writeConfig(home, {
    ...current,
    projects: projects.map((project) => (project === found ? next : project)),
  });
  return next;
}

/** Carries out what the hub asked; folders are named only inside allowed ones. */
export function projectAction(home: string, action: ProjectAction) {
  switch (action.kind) {
    case 'browse':
      return browse(home, action.folderId, action.path);
    case 'add':
      addProject(home, inside(home, action.folderId, action.path), action.name);
      return {};
    case 'update':
      updateProject(home, action.projectId, action);
      return {};
    case 'remove':
      removeProject(home, action.projectId);
      return {};
    case 'computer': {
      const { kind: _kind, ...change } = action;
      changeComputer(home, change, 'hub');
      return {};
    }
  }
}
