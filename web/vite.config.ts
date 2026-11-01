import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
const webPort = Number(process.env.HUB_WEB_PORT ?? 4173);
const apiPort = Number(process.env.HUB_PORT ?? 4317);
for (const port of [webPort, apiPort])
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port');
export default defineConfig({
  plugins: [sveltekit({ adapter: adapter({ fallback: 'index.html' }) })],
  server: {
    // `node scripts/dev.mjs --lan` sets 0.0.0.0 to open the app to the local network.
    host: process.env.HUB_WEB_HOST ?? '127.0.0.1',
    port: webPort,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
});
