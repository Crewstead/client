// Builds the app's code: the Electron main process and preload, and the computer service (the `daemon`
// package) as one file the app runs on Electron's own Node.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'build');
rmSync(out, { recursive: true, force: true });
const common = { bundle: true, platform: 'node', target: 'node24', logLevel: 'warning' };
await build({
  ...common,
  entryPoints: { main: resolve(root, 'src/main.ts'), preload: resolve(root, 'src/preload.cts') },
  outdir: out,
  outExtension: { '.js': '.cjs' },
  format: 'cjs',
  external: ['electron'],
});
// ES module, with `require` for bundled CommonJS code; Playwright stays a real package, since it
// starts its own programs from its files.
await build({
  ...common,
  entryPoints: [resolve(root, '../daemon/src/main.ts')],
  outfile: resolve(out, 'daemon/main.mjs'),
  format: 'esm',
  external: ['playwright-core'],
  banner: {
    js: "import { createRequire as __require } from 'node:module'; const require = __require(import.meta.url);",
  },
});
mkdirSync(resolve(out, 'daemon'), { recursive: true });
copyFileSync(resolve(root, '../daemon/src/mcp-bridge.mjs'), resolve(out, 'daemon/mcp-bridge.mjs'));
console.log('Built desktop/build.');
