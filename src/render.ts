import type { Tile } from './level';

export interface Color { r: number; g: number; b: number; }

export let TILE_SIZE = 64;
export let GAP = Math.round(TILE_SIZE * 0.1);
let PITCH = TILE_SIZE + GAP;

export function setPitch(pitch: number): void {
  TILE_SIZE = pitch * 10 / 11;
  GAP = pitch - TILE_SIZE;
  PITCH = pitch;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function acceptLevelColor(c: Color): boolean {
  const luma = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  return luma <= 220;
}

export function randomLevelColor(seed: number): Color {
  const rand = mulberry32(seed);
  const ch = () => Math.floor(rand() * 81) + 175;
  let c: Color;
  do { c = { r: ch(), g: ch(), b: ch() }; } while (!acceptLevelColor(c));
  return c;
}

function rgb(c: Color): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

export interface GridLayout {
  offsetX: number;
  offsetY: number;
  minX: number;
  maxX: number;
  maxY: number;
  numCols: number;
}

export function computeLayout(tiles: Tile[], canvasWidth: number, _canvasHeight: number, numCols: number, offsetY: number): GridLayout {
  const xs = tiles.map(t => t.x);
  const ys = tiles.map(t => t.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const gridW = (maxX - minX) * PITCH + TILE_SIZE;
  return {
    offsetX: (canvasWidth - gridW) / 2 - minX * PITCH,
    offsetY,
    minX,
    maxX,
    maxY,
    numCols,
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

export interface SplashState {
  x: number;
  y: number;
  progress: number; // 0 to 1
  maxRadius: number;
}

export interface RenderOptions {
  hoveredTile?: Tile | null;
  chain?: Tile[];
  cursorX?: number;
  cursorY?: number;
  splashes?: SplashState[];
  getTilePixelY?: (tile: Tile) => number;
}

function drawSplash(ctx: CanvasRenderingContext2D, splash: SplashState, color: Color) {
  ctx.save();
  ctx.globalAlpha = (1 - splash.progress * splash.progress) * 0.6;
  ctx.fillStyle = rgb(color);
  ctx.beginPath();
  ctx.arc(splash.x, splash.y, splash.maxRadius * splash.progress, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
    const border = TILE_SIZE / 16 * 1.1;
    ctx.fillStyle = '#fff';
    ctx.fillRect(px + border, py + border, TILE_SIZE - border * 2, TILE_SIZE - border * 2);
  }

  const fontSize = TILE_SIZE * 0.525;
  ctx.fillStyle = '#000';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tile.letter.toUpperCase(), px + TILE_SIZE / 2, py + TILE_SIZE / 2 + fontSize * 0.075 + PITCH * 0.01);
}

export function drawHashEmojis(ctx: CanvasRenderingContext2D, layout: GridLayout, emojis: string[], canvasH: number) {
  if (emojis.length === 0) return;
  const floorY = layout.offsetY + layout.maxY * PITCH + TILE_SIZE + (TILE_SIZE * 0.4 + PITCH * 0.05) * 0.65;
  const floorX1 = layout.offsetX - TILE_SIZE / 6 - PITCH * 0.2;
  const fontSize = Math.min(PITCH / 3, canvasH * 0.04);
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let x = floorX1 + fontSize * 0.85;
  const y = floorY + fontSize * 12.05 / 11;
  ctx.font = `${fontSize * 0.6}px sans-serif`;
  ctx.fillStyle = '#aaa';
  ctx.fillText('Hash:', x, y + fontSize * 0.15);
  x += ctx.measureText('Hash:').width + fontSize * 0.25;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = '#000';
  for (const emoji of emojis) {
    ctx.fillText(emoji, x, y);
    x += ctx.measureText(emoji).width + fontSize * 0.15;
  }
  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  tiles: Tile[],
  layout: GridLayout,
  color: Color,
  options: RenderOptions = {},
) {
  const { hoveredTile = null, chain = [], cursorX = 0, cursorY = 0, splashes = [], getTilePixelY } = options;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const splash of splashes) drawSplash(ctx, splash, color);

  const floorY = layout.offsetY + layout.maxY * PITCH + TILE_SIZE + (TILE_SIZE * 0.4 + PITCH * 0.05) * 0.65;
  const floorX1 = layout.offsetX - TILE_SIZE / 6 - PITCH * 0.2;
  const floorX2 = layout.offsetX + (layout.numCols - 1) * PITCH + TILE_SIZE + TILE_SIZE / 6 + PITCH * 0.2;
  const grad = ctx.createLinearGradient(0, floorY, 0, floorY + TILE_SIZE * 0.75);
  grad.addColorStop(0, 'rgba(100,100,100,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(floorX1, floorY, floorX2 - floorX1, TILE_SIZE * 0.75);

  drawChain(ctx, chain, layout, color, cursorX, cursorY, PITCH * 0.30);

  const highlighted = new Set(chain);
  if (hoveredTile) highlighted.add(hoveredTile);

  for (const tile of tiles) {
    drawTile(ctx, tile, layout, color, highlighted.has(tile), getTilePixelY?.(tile));
  }
}
