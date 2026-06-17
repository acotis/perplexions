import './style.css';
import { loadWords } from './words';
import { loadLevel, applyGravity } from './level';
import { randomLevelColor, computeLayout, tileAtPixel, tilePixelX, tilePixelY, render, TILE_SIZE, GAP } from './render';
import type { Tile } from './level';
import type { GridLayout, Color } from './render';

const PITCH = TILE_SIZE + GAP;
const ADD_RADIUS = PITCH * 0.45;
const REMOVE_RADIUS = PITCH * 0.40;
const GRAVITY = 3000;
const FALL_ENTRY_EXTRA = TILE_SIZE * 6;
const COLUMN_STAGGER = TILE_SIZE * 3;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let words: Set<string> = new Set();
let tiles: Tile[] = [];
let layout: GridLayout;
let color: Color;
let hoveredTile: Tile | null = null;
let chain: Tile[] = [];
let cursorX = 0;
let cursorY = 0;
let animating = false;

function redraw() {
  render(ctx, tiles, layout, color, { hoveredTile, chain, cursorX, cursorY });
}

function isAdjacent(a: Tile, b: Tile): boolean {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && (a.x !== b.x || a.y !== b.y);
}

function distToCenter(tile: Tile, px: number, py: number): number {
  const cx = tilePixelX(tile, layout) + TILE_SIZE / 2;
  const cy = tilePixelY(tile, layout) + TILE_SIZE / 2;
  return Math.hypot(px - cx, py - cy);
}

// --- input ---

canvas.addEventListener('mousedown', e => {
  if (animating || !layout) return;
  const rect = canvas.getBoundingClientRect();
  cursorX = e.clientX - rect.left;
  cursorY = e.clientY - rect.top;
  const hit = tileAtPixel(tiles, cursorX, cursorY, layout);
  if (hit) {
    chain = [hit];
    hoveredTile = null;
    redraw();
  }
});

canvas.addEventListener('mousemove', e => {
  if (animating || !layout) return;
  const rect = canvas.getBoundingClientRect();
  cursorX = e.clientX - rect.left;
  cursorY = e.clientY - rect.top;

  if (chain.length === 0) {
    const hit = tileAtPixel(tiles, cursorX, cursorY, layout);
    if (hit !== hoveredTile) {
      hoveredTile = hit;
      redraw();
    }
    return;
  }

  const last = chain[chain.length - 1];
  const secondToLast = chain.length >= 2 ? chain[chain.length - 2] : null;

  if (secondToLast && distToCenter(secondToLast, cursorX, cursorY) < REMOVE_RADIUS) {
    chain.pop();
  } else {
    for (const tile of tiles) {
      if (tile === last || chain.includes(tile)) continue;
      if (!isAdjacent(last, tile)) continue;
      if (distToCenter(tile, cursorX, cursorY) < ADD_RADIUS) {
        chain.push(tile);
        break;
      }
    }
  }

  redraw();
});

window.addEventListener('mouseup', () => {
  if (chain.length === 0) return;
  const word = chain.map(t => t.letter).join('');
  if (words.has(word)) {
    const removed = new Set(chain);
    tiles = tiles.filter(t => !removed.has(t));
    chain = [];
    hoveredTile = null;
    startCascadeAnimation();
  } else {
    chain = [];
    hoveredTile = tileAtPixel(tiles, cursorX, cursorY, layout);
    redraw();
  }
});

// --- animation ---

interface FallingTile {
  tile: Tile;
  pixelY: number;
  velocityY: number;
  targetPixelY: number;
  settled: boolean;
}

function runFallAnimation(fallingTiles: FallingTile[]) {
  animating = true;
  const yMap = new Map<Tile, number>(fallingTiles.map(ft => [ft.tile, ft.pixelY]));
  let lastTime = performance.now();

  function frame(now: number) {
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    let allSettled = true;
    for (const ft of fallingTiles) {
      if (ft.settled) continue;
      ft.velocityY += GRAVITY * delta;
      ft.pixelY += ft.velocityY * delta;
      if (ft.pixelY >= ft.targetPixelY) {
        ft.pixelY = ft.targetPixelY;
        ft.velocityY = 0;
        ft.settled = true;
      } else {
        allSettled = false;
      }
      yMap.set(ft.tile, ft.pixelY);
    }

    render(ctx, tiles, layout, color, { getTilePixelY: tile => yMap.get(tile) ?? tilePixelY(tile, layout) });

    if (allSettled) {
      animating = false;
      redraw();
    } else {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

function startDropAnimation() {
  runFallAnimation(tiles.map(tile => {
    const targetPixelY = tilePixelY(tile, layout);
    const fallDistance = layout.offsetY + layout.maxY * (TILE_SIZE + GAP) + TILE_SIZE
      + (tile.x - layout.minX + 1) * COLUMN_STAGGER + FALL_ENTRY_EXTRA;
    return {
      tile,
      pixelY: targetPixelY - fallDistance,
      velocityY: 0,
      targetPixelY,
      settled: false,
    };
  }));
}

function startCascadeAnimation() {
  const preCascade = tiles;
  const newTiles = applyGravity(preCascade);
  tiles = newTiles;

  const fallingTiles: FallingTile[] = preCascade.map((oldTile, i) => {
    const newTile = newTiles[i];
    const startY = tilePixelY(oldTile, layout);
    const targetY = tilePixelY(newTile, layout);
    return {
      tile: newTile,
      pixelY: startY,
      velocityY: 0,
      targetPixelY: targetY,
      settled: startY === targetY,
    };
  });

  if (fallingTiles.every(ft => ft.settled)) {
    redraw();
    return;
  }

  runFallAnimation(fallingTiles);
}

// --- init ---

Promise.all([loadWords(), loadLevel(new Date())]).then(([loadedWords, loadedTiles]) => {
  words = loadedWords;
  tiles = applyGravity(loadedTiles);
  color = randomLevelColor();
  layout = computeLayout(tiles, canvas.width, canvas.height);
  startDropAnimation();
});
