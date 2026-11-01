import { randomBytes } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { PRIVATE_HOME_ENTRIES, type MachineProject } from '@crewstead/core/protocol';
import { readConfig, writeConfig } from './config.ts';

/** System folders: never a project, nor anything inside them. */
const SYSTEM = ['/bin', '/boot', '/dev', '/etc', '/lib', '/lib64', '/proc', '/root', '/run'].concat(
  ['/sbin', '/sys', '/usr', '/var'],
);
/** Too broad to be a project themselves, though folders inside them can be. */
const TOO_BROAD = ['/', '/home', '/tmp', '/mnt', '/media', '/opt', '/srv'];

const inside = (path: string, folder: string) => path === folder || path.startsWith(folder + sep);

/** Checks a folder can be a project: an existing directory, not a system, home or sign-in folder. */
export function projectRoot(path: string, home = homedir()): string {
  let root: string;
  try {
    root = realpathSync(path);
  } catch {
    throw new Error(`No such folder: ${path}`);
  }
  if (!statSync(root).isDirectory()) throw new Error(`Not a folder: ${root}`);
  if (root === realpathSync(home)) throw new Error('Your whole home folder cannot be a project.');
  if (TOO_BROAD.includes(root) || SYSTEM.some((folder) => inside(root, folder)))
    throw new Error(`System folders cannot be projects: ${root}`);
  const realHome = realpathSync(home);
  for (const entry of PRIVATE_HOME_ENTRIES) {
    const folder = join(realHome, entry);
    if (inside(root, folder) || inside(folder, root))
      throw new Error(`A project cannot be or contain ${folder}, which holds private settings.`);
  }
  return root;
}

export function listProjects(home: string): MachineProject[] {
  return readConfig(home)?.projects ?? [];
}

export function addProject(home: string, path: string, name?: string): MachineProject {
  const config = readConfig(home);
  if (!config) throw new Error('Not set up yet. Run: crewstead connect <hub address>');
  const root = projectRoot(path);
  const projects = config.projects ?? [];
  if (projects.some((project) => project.path === root))
    throw new Error(`Already a project: ${root}`);
  const project: MachineProject = {
    id: randomBytes(6).toString('hex'),
    name: (name ?? basename(root)).trim().slice(0, 80) || 'Project',
    path: root,
    rules: { commands: true, network: true, browser: true },
  };
  writeConfig(home, { ...config, projects: [...projects, project] });
  return project;
}

/** Removes by id, name or folder. Files in the folder are not touched. */
export function removeProject(home: string, which: string): MachineProject {
  const config = readConfig(home);
  const projects = config?.projects ?? [];
  const found = projects.find(
    (project) => project.id === which || project.name === which || project.path === which,
  );
  if (!config || !found) throw new Error(`No project called ${which}.`);
  writeConfig(home, { ...config, projects: projects.filter((project) => project !== found) });
  return found;
}

/** The registered project, with its folder checked again now (it may have moved or become a link). */
export function openProject(home: string, id: string): MachineProject {
  const project = listProjects(home).find((entry) => entry.id === id);
  if (!project) throw new Error('This project is no longer on this computer.');
  const root = projectRoot(project.path);
  if (root !== project.path) throw new Error('The project folder moved. Add it again.');
  return project;
}
