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

export async function levelFileExists(date: Date): Promise<boolean> {
  try {
    const r = await fetch(import.meta.env.BASE_URL + `levels/${formatDate(date)}.txt`, { method: 'HEAD' });
    return r.ok && !isHtmlFallback(r);
  } catch {
    return false;
  }
}

export async function loadLevel(date: Date): Promise<ParsedLevel> {
  const response = await fetch(import.meta.env.BASE_URL + `levels/${formatDate(date)}.txt`);
  if (!response.ok || isHtmlFallback(response)) throw new Error(`Level not found: ${formatDate(date)}`);
  return parseLevel(await response.text());
}
