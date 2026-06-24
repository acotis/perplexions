import { describe, it, expect } from 'vitest';
import { parseLevel, applyGravity, formatDate } from './level';
import type { Tile } from './level';

// Sort tiles into a stable order so we can compare sets independent of array order.
function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => a.x - b.x || a.y - b.y || a.letter.localeCompare(b.letter));
}

describe('parseLevel', () => {
  it('places a single tile at the bottom-left origin', () => {
    const { tiles, numCols, numRows } = parseLevel('a');
    expect(tiles).toEqual([{ x: 0, y: 0, letter: 'a' }]);
    expect(numCols).toBe(1);
    expect(numRows).toBe(1);
  });

  it('uses bottom-up y coordinates (top line is the highest y)', () => {
    // Two rows: "a" on top, "b" on bottom.
    const { tiles, numRows } = parseLevel('a\nb');
    expect(numRows).toBe(2);
    expect(sortTiles(tiles)).toEqual([
      { x: 0, y: 0, letter: 'b' },
      { x: 0, y: 1, letter: 'a' },
    ]);
  });

  it('lowercases letters', () => {
    expect(parseLevel('AB').tiles.map(t => t.letter)).toEqual(['a', 'b']);
  });

  it('skips spaces but keeps their column positions', () => {
    const { tiles } = parseLevel('a b');
    expect(sortTiles(tiles)).toEqual([
      { x: 0, y: 0, letter: 'a' },
      { x: 2, y: 0, letter: 'b' },
    ]);
  });

  it('reports numCols as the widest line', () => {
    expect(parseLevel('a\nabc\nab').numCols).toBe(3);
  });

  it('trims trailing blank lines but keeps interior structure', () => {
    const { tiles, numRows } = parseLevel('a\n\n');
    expect(numRows).toBe(1);
    expect(tiles).toEqual([{ x: 0, y: 0, letter: 'a' }]);
  });
});

describe('applyGravity', () => {
  it('drops a floating tile to the floor', () => {
    const tiles: Tile[] = [{ x: 0, y: 3, letter: 'a' }];
    expect(applyGravity(tiles)).toEqual([{ x: 0, y: 0, letter: 'a' }]);
  });

  it('compacts a column with a gap, preserving stacking order', () => {
    // Column 0: tiles at y=0 and y=2 (gap at y=1) -> settle to y=0 and y=1.
    const tiles: Tile[] = [
      { x: 0, y: 0, letter: 'a' },
      { x: 0, y: 2, letter: 'b' },
    ];
    expect(sortTiles(applyGravity(tiles))).toEqual([
      { x: 0, y: 0, letter: 'a' },
      { x: 0, y: 1, letter: 'b' },
    ]);
  });

  it('treats columns independently', () => {
    const tiles: Tile[] = [
      { x: 0, y: 5, letter: 'a' },
      { x: 1, y: 1, letter: 'b' },
      { x: 1, y: 3, letter: 'c' },
    ];
    expect(sortTiles(applyGravity(tiles))).toEqual([
      { x: 0, y: 0, letter: 'a' },
      { x: 1, y: 0, letter: 'b' },
      { x: 1, y: 1, letter: 'c' },
    ]);
  });

  it('returns the same tile object reference when a tile does not move', () => {
    const settled: Tile = { x: 0, y: 0, letter: 'a' };
    const [result] = applyGravity([settled]);
    expect(result).toBe(settled);
  });

  it('preserves array order (parallel to input) for animation pairing', () => {
    const tiles: Tile[] = [
      { x: 0, y: 2, letter: 'a' },
      { x: 0, y: 0, letter: 'b' },
    ];
    const result = applyGravity(tiles);
    expect(result.map(t => t.letter)).toEqual(['a', 'b']);
  });
});

describe('formatDate', () => {
  it('formats as YYYY-MM-DD with zero padding', () => {
    expect(formatDate(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });

  it('uses local date components, not UTC', () => {
    expect(formatDate(new Date(2026, 11, 31, 12))).toBe('2026-12-31');
  });
});
