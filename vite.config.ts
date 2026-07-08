import { defineConfig, type Plugin } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const rootDir = fileURLToPath(new URL('./', import.meta.url));
const devLevelsDir = fileURLToPath(new URL('./dev-levels/', import.meta.url));
const wordsLevelsDir = fileURLToPath(new URL('./words-and-levels/', import.meta.url));

// Dev-only: re-run the level-splitting script and reload the page whenever a
// file in words-and-levels/ changes. The script regenerates public/levels/,
// public/words.txt, and dev-levels/ (the same thing predev does), so source
// edits show up without restarting the dev server.
function watchWordsAndLevels(): Plugin {
  const input = join(wordsLevelsDir, 'levels.txt');
  return {
    name: 'watch-words-and-levels',
    apply: 'serve',
    configureServer(server) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const regen = (file: string) => {
        if (!file.startsWith(wordsLevelsDir)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          const res = spawnSync('node', ['scripts/split-levels.js', input], { cwd: rootDir, stdio: 'inherit' });
          if (res.status === 0) server.ws.send({ type: 'full-reload' });
        }, 50);
      };
      server.watcher.add(wordsLevelsDir);
      server.watcher.on('change', regen);
      server.watcher.on('add', regen);
      server.watcher.on('unlink', regen);
    },
  };
}

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
  base: '/',
  plugins: [experimentalLevels(), watchWordsAndLevels()],
});
