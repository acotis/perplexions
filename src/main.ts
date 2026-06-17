import './style.css';
import { loadWords } from './words';
import { loadLevel, applyGravity } from './level';
import { randomLevelColor, computeLayout, tileAtPixel, tilePixelY, render, TILE_SIZE } from './render';
import type { Tile } from './level';
import type { GridLayout, Color } from './render';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let tiles: Tile[] = [];
let layout: GridLayout;
let color: Color;
let hoveredTile: Tile | null = null;
let animating = false;

function redraw() {
  render(ctx, tiles, layout, color, hoveredTile);
}

canvas.addEventListener('mousemove', e => {
  if (!layout || animating) return;
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const hit = tileAtPixel(tiles, px, py, layout);
  if (hit !== hoveredTile) {
    hoveredTile = hit;
    redraw();
  }
});

const GRAVITY = 3000;         // px/s²
const COLUMN_STAGGER = TILE_SIZE * 3; // height above canvas per column index (multiplied by 1-based index)

interface FallingTile {
  tile: Tile;
  pixelY: number;
  velocityY: number;
  targetPixelY: number;
  settled: boolean;
}

function startDropAnimation() {
  animating = true;

  const fallingTiles: FallingTile[] = tiles.map(tile => ({
    tile,
    pixelY: -(tile.x - layout.minX + 1) * COLUMN_STAGGER,
    velocityY: 0,
    targetPixelY: tilePixelY(tile, layout),
    settled: false,
  }));

  const yMap = new Map<Tile, number>();
  let lastTime = performance.now();

  function frame(now: number) {
    const delta = Math.min((now - lastTime) / 1000, 0.1); // cap delta to avoid huge jumps
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

    render(ctx, tiles, layout, color, null, tile => yMap.get(tile) ?? tilePixelY(tile, layout));

    if (allSettled) {
      animating = false;
      redraw();
    } else {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

Promise.all([loadWords(), loadLevel(new Date())]).then(([_words, loadedTiles]) => {
  tiles = applyGravity(loadedTiles);
  color = randomLevelColor();
  layout = computeLayout(tiles, canvas.width, canvas.height);
  startDropAnimation();
});
