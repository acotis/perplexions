import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node scripts/split-levels.js <input-file>');
  process.exit(1);
}

const text = readFileSync(inputFile, 'utf8');

const stripComment = line => line.replace(/#.*$/, '');
const isSeparator = line => /^[—\s]+$/.test(line) && line.includes('—');

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

const levelsDir = join(__dirname, '..', 'public', 'levels');
mkdirSync(levelsDir, { recursive: true });

function addDays(days) {
  const date = new Date(Date.UTC(2026, 5, 18 + days));
  return date.toISOString().slice(0, 10);
}

let day = 0;
for (const lines of chunks) {
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) continue;

  const filename = addDays(day++) + '.txt';
  const outputPath = join(__dirname, '..', 'public', 'levels', filename);
  writeFileSync(outputPath, lines.join('\n') + '\n');
  console.log(`Wrote ${filename}`);
}

// Delete any existing level files dated after the last one we generated.
if (day > 0) {
  const lastDate = addDays(day - 1);
  for (const file of readdirSync(levelsDir)) {
    const match = /^(\d{4}-\d{2}-\d{2})\.txt$/.exec(file);
    if (match && match[1] > lastDate) {
      unlinkSync(join(levelsDir, file));
      console.log(`Deleted ${file}`);
    }
  }
}
