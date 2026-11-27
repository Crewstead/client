// Builds the app's code: the Electron main process and preload, the computer service (the `daemon`
// package) as one file the app runs on Electron's own Node, and the web interface the window shows.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
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
// ES module, with `require` for bundled CommonJS code.
await build({
  ...common,
  entryPoints: [resolve(root, '../daemon/src/main.ts')],
  outfile: resolve(out, 'daemon/main.mjs'),
  format: 'esm',
  // Real packages beside the app: Playwright starts its own programs from its files, and node-pty
  // loads a native module for terminals.
  external: ['playwright-core', 'node-pty'],
  banner: {
    js: "import { createRequire as __appRequire } from 'node:module'; const require = __appRequire(import.meta.url);",
  },
});
mkdirSync(resolve(out, 'daemon'), { recursive: true });
// Claude Code's bridge to the hub's tools, beside the bundle, where core's runner looks for it.
const core = createRequire(resolve(root, '../daemon/package.json')).resolve(
  '@crewstead/core/adapter-claude-code',
);
copyFileSync(resolve(dirname(core), 'mcp-bridge.mjs'), resolve(out, 'daemon/mcp-bridge.mjs'));
// On Windows, the command sandbox (../sandbox-windows, Rust), beside the bundle where the service
// looks for it. Without it there, commands on Windows run only as the owner, each one approved.
if (process.platform === 'win32') {
  const crate = resolve(root, '../sandbox-windows');
  const cargo = spawnSync('cargo', ['build', '--release', '--locked'], {
    cwd: crate,
    stdio: 'inherit',
  });
  if (cargo.status !== 0)
    throw new Error('The Windows sandbox (crewstead-sandbox.exe) did not build.');
  copyFileSync(
    resolve(crate, 'target/release/crewstead-sandbox.exe'),
    resolve(out, 'daemon/crewstead-sandbox.exe'),
  );
}
// The interface, built fresh from this checkout's web app (never an older build left in web/build).
const web = resolve(root, '../web');
const vite = spawnSync(process.execPath, [resolve(web, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: web,
  stdio: ['ignore', 'ignore', 'inherit'],
});
if (vite.status !== 0) throw new Error('The web interface did not build.');
cpSync(resolve(web, 'build'), resolve(out, 'web'), { recursive: true });
console.log('Built desktop/build.');
