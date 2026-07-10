import type { Tile } from './level';
import type { Palette } from './theme';

export interface Color { r: number; g: number; b: number; }

export function luma(c: Color): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

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
  return luma(c) <= 220;
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

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// --- OKLCH conversions (Björn Ottosson's OKLab) ---
// OKLCH is perceptually uniform: holding the hue (h) constant keeps the
// *perceived* hue constant across lightness/chroma changes, unlike HSL.

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

interface Oklch { L: number; C: number; h: number; }

function rgbToOklch(col: Color): Oklch {
  const r = srgbToLinear(col.r / 255);
  const g = srgbToLinear(col.g / 255);
  const b = srgbToLinear(col.b / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(a, bb), h: Math.atan2(bb, a) };
}

function oklchToRgb({ L, C, h }: Oklch): Color {
  const a = C * Math.cos(h);
  const bb = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * bb;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const to255 = (c: number) => Math.round(clamp(linearToSrgb(c), 0, 1) * 255);
  return { r: to255(r), g: to255(g), b: to255(b) };
}

// Level colors are light pastels (channels 175–255). For dark mode we *lift*
// them down into a mid perceptual-lightness band (rather than flipping them to
// the opposite side of the background). Working in OKLCH keeps the perceived hue
// fixed through the lightness change.
export function toDarkLevelColor(c: Color): Color {
  const { L, C, h } = rgbToOklch(c);
  const C2 = Math.min(0.13, C * 1.8);
  const L2 = clamp(L - 0.30, 0.45, 0.62);
  return oklchToRgb({ L: L2, C: C2, h });
}

export interface GridLayout {
  offsetX: number;
  offsetY: number;
  minX: number;
  maxX: number;
  maxY: number;
  numCols: number;
  pitch: number;
  tileSize: number;
  gap: number;
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
    pitch: PITCH,
    tileSize: TILE_SIZE,
    gap: GAP,
  };
}

export function tilePixelX(tile: Tile, layout: GridLayout): number {
  return layout.offsetX + tile.x * layout.pitch;
}

export function tilePixelY(tile: Tile, layout: GridLayout): number {
  return layout.offsetY + (layout.maxY - tile.y) * layout.pitch;
}

export function tileAtPixel(tiles: Tile[], px: number, py: number, layout: GridLayout): Tile | null {
  const { pitch, tileSize } = layout;
  const dx = px - layout.offsetX;
  const dy = py - layout.offsetY;
  const gx = Math.floor(dx / pitch);
  const gy = layout.maxY - Math.floor(dy / pitch);
  const rx = dx - Math.floor(dx / pitch) * pitch;
  const ry = dy - Math.floor(dy / pitch) * pitch;
  if (rx >= tileSize || ry >= tileSize) return null;
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
  hardMode?: boolean;
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
  maxLinkLen: number,
) {
  if (chain.length === 0) return;
  const half = layout.tileSize / 2;
  ctx.save();
  ctx.strokeStyle = rgb(color);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(tilePixelX(chain[0], layout) + half, tilePixelY(chain[0], layout) + half);
  for (let i = 1; i < chain.length; i++) {
    ctx.lineTo(tilePixelX(chain[i], layout) + half, tilePixelY(chain[i], layout) + half);
  }
  const lastCx = tilePixelX(chain[chain.length - 1], layout) + half;
  const lastCy = tilePixelY(chain[chain.length - 1], layout) + half;
  const dx = cursorX - lastCx;
  const dy = cursorY - lastCy;
  const dist = Math.hypot(dx, dy);
  const clampedDist = Math.min(dist, maxLinkLen);
  const endX = dist > 0 ? lastCx + (dx / dist) * clampedDist : lastCx;
  const endY = dist > 0 ? lastCy + (dy / dist) * clampedDist : lastCy;
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();
}

function beveledPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, b: number) {
  ctx.beginPath();
  if (b <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + b, y);
  ctx.lineTo(x + w - b, y);
  ctx.lineTo(x + w, y + b);
  ctx.lineTo(x + w, y + h - b);
  ctx.lineTo(x + w - b, y + h);
  ctx.lineTo(x + b, y + h);
  ctx.lineTo(x, y + h - b);
  ctx.lineTo(x, y + b);
  ctx.closePath();
}

function fillBeveledRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, b: number) {
  beveledPath(ctx, x, y, w, h, b);
  ctx.fill();
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  layout: GridLayout,
  color: Color,
  highlighted: boolean,
  hardMode: boolean,
  palette: Palette,
  pyOverride?: number,
) {
  const { tileSize, pitch } = layout;
  const size = tileSize * (hardMode ? 1.03 : 1);
  const offset = (size - tileSize) / 2;
  const px = tilePixelX(tile, layout) - offset;
  const py = (pyOverride ?? tilePixelY(tile, layout)) - offset;
  const bevel = hardMode ? size * 0.18 : 0;

  ctx.fillStyle = rgb(color);
  fillBeveledRect(ctx, px, py, size, size, bevel);

  if (!highlighted) {
    const border = tileSize / 16 * 1.1;
    const ix = px + border, iy = py + border, iw = size - border * 2, ih = size - border * 2;
    const ibevel = Math.max(bevel - border * (2 - Math.SQRT2), 0);
    ctx.fillStyle = palette.tileInterior;
    fillBeveledRect(ctx, ix, iy, iw, ih, ibevel);

    if (hardMode) {
      ctx.save();
      beveledPath(ctx, ix, iy, iw, ih, ibevel);
      ctx.clip();
      ctx.globalAlpha = 0.36;
      ctx.strokeStyle = rgb(color);
      ctx.lineWidth = tileSize * 0.0225;
      const spacing = tileSize * 0.106875;
      const o = ih;
      // Align the pattern so the k=0 stripe lies exactly on the tile's
      // bottom-left-to-top-right diagonal.
      const kStart = Math.ceil(-ih / spacing);
      const kEnd = Math.floor(iw / spacing);
      ctx.beginPath();
      for (let k = kStart; k <= kEnd; k++) {
        const d = k * spacing;
        ctx.moveTo(ix + d - o, iy + ih + o);
        ctx.lineTo(ix + d + ih + o, iy - o);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  const fontSize = tileSize * 0.525;
  // Pick a glyph color that contrasts whatever is directly behind it: the candy
  // fill when the tile is selected, otherwise the tile interior.
  const behindIsDark = highlighted ? luma(color) < 150 : palette.interiorIsDark;
  ctx.fillStyle = behindIsDark ? palette.glyphLight : palette.glyphDark;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tile.letter.toUpperCase(), px + size / 2, py + size / 2 + fontSize * 0.075 + pitch * 0.01);
}

export function drawHashEmojis(ctx: CanvasRenderingContext2D, layout: GridLayout, emojis: string[], canvasH: number) {
  if (emojis.length === 0) return;
  const { pitch, tileSize } = layout;
  const floorY = layout.offsetY + layout.maxY * pitch + tileSize + (tileSize * 0.4 + pitch * 0.05) * 0.65;
  const floorX1 = layout.offsetX - tileSize / 6 - pitch * 0.2;
  const fontSize = Math.min(pitch / 3, canvasH * 0.04);
  ctx.save();
  ctx.font = `${fontSize}px 'Perplexions Emoji', sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let x = floorX1 + fontSize * 0.85 - fontSize * 0.1;
  const y = floorY + fontSize * 12.05 / 11 - fontSize * 0.1;
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
  palette: Palette,
  options: RenderOptions = {},
) {
  const { hoveredTile = null, chain = [], cursorX = 0, cursorY = 0, splashes = [], getTilePixelY, hardMode = false } = options;
  const { pitch, tileSize } = layout;

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const splash of splashes) drawSplash(ctx, splash, color);

  const floorY = layout.offsetY + layout.maxY * pitch + tileSize + (tileSize * 0.4 + pitch * 0.05) * 0.65;
  const floorX1 = layout.offsetX - tileSize / 6 - pitch * 0.2;
  const floorX2 = layout.offsetX + (layout.numCols - 1) * pitch + tileSize + tileSize / 6 + pitch * 0.2;
  const grad = ctx.createLinearGradient(0, floorY, 0, floorY + tileSize * 0.75);
  grad.addColorStop(0, palette.floorShadowNear);
  grad.addColorStop(palette.floorShadowFalloff, palette.floorShadowFar);
  ctx.fillStyle = grad;
  ctx.fillRect(floorX1, floorY, floorX2 - floorX1, tileSize * 0.75);

  const linkWidth = pitch * 0.30 * (hardMode ? 1.4875 : 1);
  const maxLinkLen = pitch * 1.1 * (hardMode ? 0.5 * 1.1 * 0.95 : 1.05);
  drawChain(ctx, chain, layout, color, cursorX, cursorY, linkWidth, maxLinkLen);

  const highlighted = new Set(chain);
  if (hoveredTile) highlighted.add(hoveredTile);

  for (const tile of tiles) {
    drawTile(ctx, tile, layout, color, highlighted.has(tile), hardMode, palette, getTilePixelY?.(tile));
  }
}
