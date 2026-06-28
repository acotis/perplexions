import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node scripts/split-levels.js <input-file>');
  process.exit(1);
}

const stripComment = line => line.replace(/#.*$/, '');
const isSeparator = line => /^[—\s]+$/.test(line) && line.includes('—');

function splitChunks(text) {
  const chunks = [];
  let current = [];
  for (const rawLine of text.split('\n')) {
    const line = stripComment(rawLine);
    if (isSeparator(line)) {
      chunks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  chunks.push(current);
  return chunks;
}

function addDays(days) {
  const date = new Date(Date.UTC(2026, 5, 18 + days));
  return date.toISOString().slice(0, 10);
}

// Writes non-empty chunks as dated level files into `dir`, starting at
// `startDay`, then deletes any dated file there that falls outside the range we
// just wrote. Returns the next free day so a later call can continue the
// sequence.
function writeLevels(chunks, dir, startDay) {
  mkdirSync(dir, { recursive: true });
  let day = startDay;
  for (const lines of chunks) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length === 0) continue;

    const filename = addDays(day++) + '.txt';
    writeFileSync(join(dir, filename), lines.join('\n') + '\n');
    console.log(`Wrote ${dir.endsWith('dev-levels') ? 'dev-levels/' : ''}${filename}`);
  }

  const firstDate = addDays(startDay);
  const lastDate = addDays(day - 1);
  for (const file of readdirSync(dir)) {
    const match = /^(\d{4}-\d{2}-\d{2})\.txt$/.exec(file);
    if (match && (match[1] > lastDate || match[1] < firstDate)) {
      unlinkSync(join(dir, file));
      console.log(`Deleted ${file}`);
    }
  }
  return day;
}

const publicDir = join(__dirname, '..', 'public');

// Copy the words list (sibling of the input file) into public/ so the dev
// server and build can serve it; the app fetches it at runtime.
copyFileSync(join(dirname(inputFile), 'words.txt'), join(publicDir, 'words.txt'));
console.log('Copied words.txt');

const nextDay = writeLevels(splitChunks(readFileSync(inputFile, 'utf8')), join(publicDir, 'levels'), 0);

// Experimental levels (if present) continue the date sequence right after the
// last official level, but land OUTSIDE public/ in dev-levels/ so they're never
// copied into a production build or served by the deployed site. Only the
// dev-only Vite middleware serves them, gated in-app behind the dev password.
const experimentalFile = join(dirname(inputFile), 'levels-experimental.txt');
if (existsSync(experimentalFile)) {
  writeLevels(splitChunks(readFileSync(experimentalFile, 'utf8')), join(__dirname, '..', 'dev-levels'), nextDay);
}
