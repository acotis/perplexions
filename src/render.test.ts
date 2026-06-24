import { describe, it, expect, beforeEach } from 'vitest';
import {
  randomLevelColor,
  computeLayout,
  tilePixelX,
  tilePixelY,
  tileAtPixel,
  setPitch,
  TILE_SIZE,
  GAP,
} from './render';
import type { Tile } from './level';

// Pin the global scale to round numbers: pitch 110 -> tile 100, gap 10.
beforeEach(() => setPitch(110));

describe('randomLevelColor', () => {
  it('is deterministic for a given seed', () => {
    expect(randomLevelColor(12345)).toEqual(randomLevelColor(12345));
  });

  // Golden values: pin the seed->color mapping so a change to the PRNG or the
  // rejection sampling fails loudly — it would change every daily level's color.
  it('matches known golden values', () => {
    expect(randomLevelColor(0)).toEqual({ r: 196, g: 175, b: 193 });
    expect(randomLevelColor(1)).toEqual({ r: 225, g: 175, b: 217 });
    expect(randomLevelColor(42)).toEqual({ r: 223, g: 211, b: 244 });
  });

  it('produces different colors for different seeds', () => {
    expect(randomLevelColor(1)).not.toEqual(randomLevelColor(2));
  });

  it('keeps every channel in the pastel range [175, 255]', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { r, g, b } = randomLevelColor(seed);
      for (const ch of [r, g, b]) {
        expect(ch).toBeGreaterThanOrEqual(175);
        expect(ch).toBeLessThanOrEqual(255);
      }
    }
  });

  it('never returns a color brighter than the luma cap', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { r, g, b } = randomLevelColor(seed);
      expect(0.299 * r + 0.587 * g + 0.114 * b).toBeLessThanOrEqual(220);
    }
  });
});

describe('setPitch', () => {
  it('splits pitch into a 10/11 tile and the remaining gap', () => {
    setPitch(110);
    expect(TILE_SIZE).toBe(100);
    expect(GAP).toBe(10);
  });
});

describe('computeLayout', () => {
  it('centers the grid horizontally in the canvas', () => {
    const tiles: Tile[] = [
      { x: 0, y: 0, letter: 'a' },
      { x: 1, y: 0, letter: 'b' },
    ];
    // gridW = (1-0)*110 + 100 = 210; canvas 1000 -> offsetX = (1000-210)/2 - 0 = 395.
    const layout = computeLayout(tiles, 1000, 0, 2, 50);
    expect(layout.offsetX).toBe(395);
    expect(layout.offsetY).toBe(50);
    expect(layout.minX).toBe(0);
    expect(layout.maxX).toBe(1);
    expect(layout.maxY).toBe(0);
  });

  it('offsets so the leftmost column lands correctly when minX > 0', () => {
    const tiles: Tile[] = [{ x: 2, y: 0, letter: 'a' }];
    const layout = computeLayout(tiles, 1000, 0, 3, 0);
    // A single tile is centered: its pixel x should be (canvas - tile)/2.
    expect(tilePixelX(tiles[0], layout)).toBeCloseTo((1000 - 100) / 2);
  });
});

describe('tile pixel <-> grid round trip', () => {
  it('maps a tile center back to the same tile via tileAtPixel', () => {
    const tiles: Tile[] = [
      { x: 0, y: 0, letter: 'a' },
      { x: 1, y: 0, letter: 'b' },
      { x: 1, y: 1, letter: 'c' },
    ];
    const layout = computeLayout(tiles, 1000, 0, 2, 50);
    for (const tile of tiles) {
      const cx = tilePixelX(tile, layout) + TILE_SIZE / 2;
      const cy = tilePixelY(tile, layout) + TILE_SIZE / 2;
      expect(tileAtPixel(tiles, cx, cy, layout)).toBe(tile);
    }
  });

  it('returns null when the pixel falls in the gap between tiles', () => {
    const tiles: Tile[] = [
      { x: 0, y: 0, letter: 'a' },
      { x: 1, y: 0, letter: 'b' },
    ];
    const layout = computeLayout(tiles, 1000, 0, 2, 50);
    // Just past the right edge of tile (0,0), inside the gap before tile (1,0).
    const gapX = tilePixelX(tiles[0], layout) + TILE_SIZE + GAP / 2;
    const cy = tilePixelY(tiles[0], layout) + TILE_SIZE / 2;
    expect(tileAtPixel(tiles, gapX, cy, layout)).toBeNull();
  });

  it('places higher y values higher on screen (smaller pixel y)', () => {
    const low: Tile = { x: 0, y: 0, letter: 'a' };
    const high: Tile = { x: 0, y: 1, letter: 'b' };
    const layout = computeLayout([low, high], 1000, 0, 1, 50);
    expect(tilePixelY(high, layout)).toBeLessThan(tilePixelY(low, layout));
  });
});
