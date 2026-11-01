import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const roots = [
  'web',
  'ui',
  'daemon',
  'desktop/src',
  'desktop/scripts',
  'desktop/assets',
  'scripts',
  'tests',
];
const failures = [];
let checked = 0;

// Module boundaries (docs/plan/22-modularity.md). Core reaches modules only through these files;
// a module reaches another module only through that module's ports.ts.
const moduleRoots = [
  { root: 'web/src/lib/modules', entry: ['registry.ts', 'types.ts', 'ModuleSlot.svelte'] },
];
function target(file, specifier) {
  if (specifier.startsWith('#lib/')) return join('web/src/lib', specifier.slice(5));
  if (specifier.startsWith('.')) return relative('.', resolve(dirname(file), specifier));
  return undefined;
}
function moduleBoundary(file, text) {
  const specifiers = [...text.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const { root, entry } of moduleRoots)
    for (const specifier of specifiers) {
      const to = target(file, specifier);
      if (!to?.startsWith(`${root}/`)) continue;
      const [toModule, ...rest] = to.slice(root.length + 1).split('/');
      const fromInside = file.startsWith(`${root}/`);
      const fromModule = fromInside ? file.slice(root.length + 1).split('/')[0] : undefined;
      if (!rest.length) {
        // A file directly in the modules folder: only the shared entry files may be imported.
        if (!entry.includes(toModule) && !fromInside)
          failures.push(`${file}: imports module internals ${specifier}`);
        continue;
      }
      const composition = fromInside && !file.slice(root.length + 1).includes('/');
      if (composition && ['index.ts', 'module.ts'].includes(rest.join('/'))) continue;
      if (!fromInside) failures.push(`${file}: core imports module internals ${specifier}`);
      else if (fromModule !== toModule && rest.join('/') !== 'ports.ts')
        failures.push(`${file}: imports another module's internals ${specifier}`);
    }
}
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.svelte-kit', 'build'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!/\.(ts|mjs|js|svelte|css)$/.test(path)) continue;
    const text = await readFile(path, 'utf8');
    checked++;
    if (text.split('\n').length > 400 || text.split(/\s+/).length > 2000)
      failures.push(`${path}: file-size limit`);
    moduleBoundary(path, text);
    // The computer service shares only core with the web app.
    if (path.startsWith('daemon/') && /from ['"]([./]*(web|ui)\/|@crewstead\/(web|ui))/.test(text))
      failures.push(`${path}: the computer service imports web app code`);
    // Only the cloud sandbox runs code on the server, in its containers (AGENTS.md); web search runs the
    // hub's own SearXNG container with it.
    if (/from ['"]@crewstead\/core\/sandbox['"]/.test(text) && !path.startsWith('tests/'))
      failures.push(`${path}: only the cloud-sandbox and web-search modules may use the sandbox`);
    // The desktop app uses the computer service's own modules, never the web app's code.
    if (path.startsWith('desktop/') && /from ['"]([./]*(web|ui)\/|@crewstead\/(web|ui))/.test(text))
      failures.push(`${path}: the desktop app imports web app code`);
    if (/from ['"](@openai\/codex|@anthropic-ai\/claude-agent-sdk)/.test(text))
      failures.push(`${path}: prohibited CLI-backed SDK`);
  }
}
for (const root of roots) await walk(root);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(`Checked ${checked} authored source files: size and dependency boundaries passed.`);
