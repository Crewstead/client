import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MachineActionResult, PlanFileAction } from '@crewstead/core/protocol';
import {
  NOTE_FOLDER,
  NOTE_MAX_BYTES,
  noteFile,
  NOTES_PER_PLAN,
  PLAN_FILE,
  PLAN_FOLDER,
  PLAN_MAX_BYTES,
  PLANS_PER_PROJECT,
  planFolder,
} from '@crewstead/core/plans';
import { openProject } from './projects.ts';
import { replaceFile } from './tools/files.ts';
import { projectPath } from './tools/paths.ts';

/**
 * A project's plans for the hub (docs/plan/33-plan-record.md): only `.crewstead/plans/<folder>/plan.yaml`
 * and its `research/*.md` notes, resolved through the same checks as the file tools, so links cannot
 * lead outside the project.
 */
type Answer = Omit<MachineActionResult, 'requestId'>;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** A file inside the plans folder, or undefined when there is none. */
async function readInside(root: string, path: string, limit: number) {
  const { real } = await projectPath(root, `${PLAN_FOLDER}/${path}`);
  const info = await stat(real).catch(() => undefined);
  if (!info?.isFile()) return undefined;
  if (info.size > limit) throw new Error(`${path} is larger than ${limit / 1024} KB.`);
  const content = await readFile(real, 'utf8');
  return { content, hash: sha256(content) };
}

/** Writes over what the hub last saw (`base`), so a hand edit since then is never lost. */
async function writeInside(
  root: string,
  path: string,
  content: string,
  base: string | undefined,
  limit: number,
) {
  const current = await readInside(root, path, limit);
  if (current ? current.hash !== base : base) return { stale: true as const, current };
  const full = `${PLAN_FOLDER}/${path}`;
  const { real } = await projectPath(root, full, { write: true, plans: true });
  await mkdir(dirname(real), { recursive: true });
  // The folders may have just been made; check again that the file is still inside the project.
  const checked = await projectPath(root, full, { write: true, plans: true });
  await replaceFile(checked.real, content);
  return { stale: false as const, hash: sha256(content) };
}

async function notesOf(root: string, folder: string) {
  const { real } = await projectPath(root, `${PLAN_FOLDER}/${folder}/${NOTE_FOLDER}`);
  const names = await readdir(real, { withFileTypes: true }).catch(() => []);
  const notes: NonNullable<Answer['notes']> = [];
  for (const entry of names.filter((e) => e.isFile()).slice(0, NOTES_PER_PLAN)) {
    const file = `${NOTE_FOLDER}/${entry.name}`;
    if (!noteFile.safeParse(file).success) continue;
    const read = await readInside(root, `${folder}/${file}`, NOTE_MAX_BYTES).catch(() => undefined);
    if (read) notes.push({ file, hash: read.hash, bytes: Buffer.byteLength(read.content) });
  }
  return notes.sort((a, b) => a.file.localeCompare(b.file));
}

export async function planFiles(home: string, action: PlanFileAction): Promise<Answer> {
  const root = openProject(home, action.projectId).path;
  const planPath = (folder: string) => `${folder}/${PLAN_FILE}`;
  switch (action.kind) {
    case 'plans_list': {
      const { real } = await projectPath(root, PLAN_FOLDER);
      const names = await readdir(real, { withFileTypes: true }).catch(() => []);
      const folders = names
        .filter((entry) => entry.isDirectory() && planFolder.safeParse(entry.name).success)
        .map((entry) => entry.name)
        .sort()
        .reverse()
        .slice(0, PLANS_PER_PROJECT);
      const plans: NonNullable<Answer['plans']> = [];
      for (const folder of folders) {
        const file = await readInside(root, planPath(folder), PLAN_MAX_BYTES).catch(
          () => undefined,
        );
        if (file) plans.push({ folder, hash: file.hash, bytes: Buffer.byteLength(file.content) });
      }
      return { plans };
    }
    case 'plan_read': {
      const plan = await readInside(root, planPath(action.folder), PLAN_MAX_BYTES);
      if (!plan) throw new Error(`There is no plan ${action.folder} in this project.`);
      return {
        plan: { folder: action.folder, ...plan },
        notes: await notesOf(root, action.folder),
      };
    }
    case 'plan_write': {
      const path = planPath(action.folder);
      const done = await writeInside(root, path, action.content, action.base, PLAN_MAX_BYTES);
      if (done.stale)
        return done.current
          ? { stale: true, plan: { folder: action.folder, ...done.current } }
          : { stale: true };
      return { plan: { folder: action.folder, content: action.content, hash: done.hash } };
    }
    case 'plan_note_read': {
      const note = await readInside(root, `${action.folder}/${action.file}`, NOTE_MAX_BYTES);
      if (!note) throw new Error(`There is no note ${action.file} in this plan.`);
      return { note: { file: action.file, ...note } };
    }
    case 'plan_note_write': {
      const path = `${action.folder}/${action.file}`;
      const done = await writeInside(root, path, action.content, action.base, NOTE_MAX_BYTES);
      if (done.stale)
        return done.current
          ? { stale: true, note: { file: action.file, ...done.current } }
          : { stale: true };
      return { note: { file: action.file, content: action.content, hash: done.hash } };
    }
  }
}
