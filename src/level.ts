export interface Tile {
  x: number;
  y: number;
  letter: string;
}

export function parseLevel(text: string): Tile[] {
  const lines = text.split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  const tiles: Tile[] = [];
  const rowCount = lines.length;
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
  return tiles;
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

export async function loadLevel(date: Date): Promise<Tile[]> {
  const response = await fetch(import.meta.env.BASE_URL + 'levels.json');
  const { launch, levels }: { launch: string; levels: string[] } = await response.json();

  const todayStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dayIndex = Math.max(0, Math.round((new Date(todayStr).getTime() - new Date(launch).getTime()) / 86400000));
  const levelFile = levels[Math.min(dayIndex, levels.length - 1)];

  const levelResponse = await fetch(import.meta.env.BASE_URL + levelFile);
  return parseLevel(await levelResponse.text());
}
