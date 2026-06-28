import { defineConfig, type Plugin } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const devLevelsDir = fileURLToPath(new URL('./dev-levels/', import.meta.url));

// Dev-only: serve experimental level files at /levels-experimental/<date>.txt.
// These live in dev-levels/ (outside public/), so they are never part of a
// production build and the deployed site simply 404s them. The app only
// requests them once the dev password unlocks dev mode.
function experimentalLevels(): Plugin {
  return {
    name: 'serve-experimental-levels',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/\/levels-experimental\/(\d{4}-\d{2}-\d{2}\.txt)(?:[?#]|$)/);
        if (!match) return next();
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const file = join(devLevelsDir, match[1]);
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  base: '/perplexions/',
  plugins: [experimentalLevels()],
});
