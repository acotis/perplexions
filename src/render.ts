import type { Tile } from './level';

export interface Color { r: number; g: number; b: number; }

export const TILE_SIZE = 64;
export const GAP = Math.round(TILE_SIZE * 0.1);
const PITCH = TILE_SIZE + GAP;
const BORDER = 4;

export function randomLevelColor(): Color {
  const ch = () => Math.floor(Math.random() * 51) + 200;
  return { r: ch(), g: ch(), b: ch() };
}

function rgb(c: Color): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

export interface GridLayout {
  offsetX: number;
  offsetY: number;
  minX: number;
  maxY: number;
}

export function computeLayout(tiles: Tile[], canvasWidth: number, canvasHeight: number): GridLayout {
  const xs = tiles.map(t => t.x);
  const ys = tiles.map(t => t.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const gridW = (maxX - minX) * PITCH + TILE_SIZE;
  const gridH = maxY * PITCH + TILE_SIZE;
  return {
    offsetX: Math.floor((canvasWidth - gridW) / 2) - minX * PITCH,
    offsetY: Math.floor((canvasHeight - gridH) / 2),
    minX,
    maxY,
  };
}

export function tilePixelX(tile: Tile, layout: GridLayout): number {
  return layout.offsetX + tile.x * PITCH;
}

export function tilePixelY(tile: Tile, layout: GridLayout): number {
  return layout.offsetY + (layout.maxY - tile.y) * PITCH;
}

export function tileAtPixel(tiles: Tile[], px: number, py: number, layout: GridLayout): Tile | null {
  const dx = px - layout.offsetX;
  const dy = py - layout.offsetY;
  const gx = Math.floor(dx / PITCH);
  const gy = layout.maxY - Math.floor(dy / PITCH);
  const rx = dx - Math.floor(dx / PITCH) * PITCH;
  const ry = dy - Math.floor(dy / PITCH) * PITCH;
  if (rx >= TILE_SIZE || ry >= TILE_SIZE) return null;
  return tiles.find(t => t.x === gx && t.y === gy) ?? null;
}

export interface RenderOptions {
  hoveredTile?: Tile | null;
  chain?: Tile[];
  cursorX?: number;
  cursorY?: number;
  getTilePixelY?: (tile: Tile) => number;
}

function drawChain(
  ctx: CanvasRenderingContext2D,
  chain: Tile[],
  layout: GridLayout,
  color: Color,
  cursorX: number,
  cursorY: number,
  lineWidth: number,
) {
  if (chain.length === 0) return;
  ctx.save();
  ctx.strokeStyle = rgb(color);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(tilePixelX(chain[0], layout) + TILE_SIZE / 2, tilePixelY(chain[0], layout) + TILE_SIZE / 2);
  for (let i = 1; i < chain.length; i++) {
    ctx.lineTo(tilePixelX(chain[i], layout) + TILE_SIZE / 2, tilePixelY(chain[i], layout) + TILE_SIZE / 2);
  }
  const lastCx = tilePixelX(chain[chain.length - 1], layout) + TILE_SIZE / 2;
  const lastCy = tilePixelY(chain[chain.length - 1], layout) + TILE_SIZE / 2;
  const dx = cursorX - lastCx;
  const dy = cursorY - lastCy;
  const dist = Math.hypot(dx, dy);
  const clampedDist = Math.min(dist, PITCH);
  const endX = dist > 0 ? lastCx + (dx / dist) * clampedDist : lastCx;
  const endY = dist > 0 ? lastCy + (dy / dist) * clampedDist : lastCy;
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  layout: GridLayout,
  color: Color,
  highlighted: boolean,
  pyOverride?: number,
) {
  const px = tilePixelX(tile, layout);
  const py = pyOverride ?? tilePixelY(tile, layout);

  ctx.fillStyle = rgb(color);
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  if (!highlighted) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(px + BORDER, py + BORDER, TILE_SIZE - BORDER * 2, TILE_SIZE - BORDER * 2);
  }

  const fontSize = 36;
  ctx.fillStyle = '#000';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tile.letter.toUpperCase(), px + TILE_SIZE / 2, py + TILE_SIZE / 2 + fontSize * 0.075);
}

export function render(
  ctx: CanvasRenderingContext2D,
  tiles: Tile[],
  layout: GridLayout,
  color: Color,
  options: RenderOptions = {},
) {
  const { hoveredTile = null, chain = [], cursorX = 0, cursorY = 0, getTilePixelY } = options;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  drawChain(ctx, chain, layout, color, cursorX, cursorY, 24);

  const highlighted = new Set(chain);
  if (hoveredTile) highlighted.add(hoveredTile);

  for (const tile of tiles) {
    drawTile(ctx, tile, layout, color, highlighted.has(tile), getTilePixelY?.(tile));
  }
}
