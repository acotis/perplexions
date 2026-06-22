export interface Tile {
  x: number;
  y: number;
  letter: string;
}

export interface ParsedLevel {
  tiles: Tile[];
  numCols: number;
  numRows: number;
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

export async function levelFileExists(date: Date): Promise<boolean> {
  const key = formatDate(date);
  if (existsCache.has(key)) return existsCache.get(key)!;
  try {
    const r = await fetch(import.meta.env.BASE_URL + `levels/${key}.txt`, { method: 'HEAD' });
    const result = r.ok && !isHtmlFallback(r);
    existsCache.set(key, result);
    return result;
  } catch {
    return false;
  }
}

export async function loadLevel(date: Date, force = false): Promise<ParsedLevel> {
  const now = new Date();
  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (!force && date.getTime() > todayNoon.getTime()) throw new Error(`Level not found: ${formatDate(date)}`);
  const response = await fetch(import.meta.env.BASE_URL + `levels/${formatDate(date)}.txt`);
  if (!response.ok || isHtmlFallback(response)) throw new Error(`Level not found: ${formatDate(date)}`);
  existsCache.set(formatDate(date), true);
  return parseLevel(await response.text());
}
