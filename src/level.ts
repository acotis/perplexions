export interface Tile {
  x: number;
  y: number;
  letter: string;
}

export interface ParsedLevel {
  tiles: Tile[];
  numCols: number;
  numRows: number;
  // True when the level came from the dev-only experimental store rather than
  // the published levels/ directory. Drives the "EXPERIMENTAL LEVEL" label.
  experimental?: boolean;
}

export function parseLevel(text: string): ParsedLevel {
  const lines = text.split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  const tiles: Tile[] = [];
  const rowCount = lines.length;
  const numCols = Math.max(...lines.map(l => l.length));
  for (let row = 0; row < rowCount; row++) {
    const y = rowCount - 1 - row;
    const line = lines[row];
    for (let x = 0; x < line.length; x++) {
      const ch = line[x];
      if (ch !== ' ') {
        tiles.push({ x, y, letter: ch.toLowerCase() });
      }
    }
  }
  return { tiles, numCols, numRows: rowCount };
}

export function applyGravity(tiles: Tile[]): Tile[] {
  const columns = new Map<number, number[]>();
  for (const tile of tiles) {
    if (!columns.has(tile.x)) columns.set(tile.x, []);
    columns.get(tile.x)!.push(tile.y);
  }
  for (const ys of columns.values()) ys.sort((a, b) => a - b);
  return tiles.map(tile => {
    const settledY = columns.get(tile.x)!.indexOf(tile.y);
    return settledY === tile.y ? tile : { ...tile, y: settledY };
  });
}

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isHtmlFallback(r: Response): boolean {
  return (r.headers.get('content-type') ?? '').includes('text/html');
}

const existsCache = new Map<string, boolean>();

// In dev mode we also look in the experimental store, which the dev server
// serves outside public/. Official levels are always tried first.
function levelUrls(key: string, dev: boolean): string[] {
  const urls = [import.meta.env.BASE_URL + `levels/${key}.txt`];
  if (dev) urls.push(import.meta.env.BASE_URL + `levels-experimental/${key}.txt`);
  return urls;
}

export async function levelFileExists(date: Date, dev = false): Promise<boolean> {
  const key = formatDate(date);
  if (existsCache.has(key)) return existsCache.get(key)!;
  try {
    for (const url of levelUrls(key, dev)) {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok && !isHtmlFallback(r)) {
        existsCache.set(key, true);
        return true;
      }
    }
    existsCache.set(key, false);
    return false;
  } catch {
    return false;
  }
}

export async function loadLevel(date: Date, force = false): Promise<ParsedLevel> {
  const key = formatDate(date);
  const now = new Date();
  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (!force && date.getTime() > todayNoon.getTime()) throw new Error(`Level not found: ${key}`);

  // Index 0 is the official level; index 1 (dev only) is the experimental one.
  const urls = levelUrls(key, force);
  for (let i = 0; i < urls.length; i++) {
    const response = await fetch(urls[i]);
    if (response.ok && !isHtmlFallback(response)) {
      existsCache.set(key, true);
      return { ...parseLevel(await response.text()), experimental: i > 0 };
    }
  }
  throw new Error(`Level not found: ${key}`);
}
