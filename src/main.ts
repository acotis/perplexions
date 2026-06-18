import './style.css';
import { loadWords } from './words';
import { loadLevel, applyGravity } from './level';
import { randomLevelColor, computeLayout, tileAtPixel, tilePixelX, tilePixelY, render, setPitch, TILE_SIZE, GAP } from './render';
import type { Tile } from './level';
import type { GridLayout, Color, SplashState } from './render';

const GRAVITY_TILES_PER_S2 = 3000 / 64;

let PITCH = TILE_SIZE + GAP;
let ADD_RADIUS = PITCH * 0.45;
let REMOVE_RADIUS = PITCH * 0.40;
let GRAVITY = 3000;
let COLUMN_STAGGER = TILE_SIZE * 3;
let FALL_ENTRY_EXTRA = TILE_SIZE * 6;

function applyScale(pitch: number): void {
  setPitch(pitch);
  PITCH = TILE_SIZE + GAP;
  ADD_RADIUS = PITCH * 0.45;
  REMOVE_RADIUS = PITCH * 0.40;
  GRAVITY = GRAVITY_TILES_PER_S2 * TILE_SIZE;
  COLUMN_STAGGER = TILE_SIZE * 3;
  FALL_ENTRY_EXTRA = TILE_SIZE * 6;
  console.log(`pitch=${pitch} tile=${TILE_SIZE} gap=${GAP}`);
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dpr = window.devicePixelRatio || 1;
let canvasW = 0;
let canvasH = 0;

function setCanvasSize(w: number, h: number) {
  canvasW = w;
  canvasH = h;
  const bufW = Math.round(w * dpr);
  const bufH = Math.round(h * dpr);
  if (canvas.width !== bufW || canvas.height !== bufH) {
    canvas.width = bufW;
    canvas.height = bufH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

const undoHintIcon = new Image();
let undoHintIconLoaded = false;
undoHintIcon.onload = () => { undoHintIconLoaded = true; };
undoHintIcon.src = import.meta.env.BASE_URL + 'right-click-icon.svg';

let hintFirstShownTime: number | null = null;
let hintFadeComplete = false;
let hintFadeLoopRunning = false;

function runHintFadeLoop() {
  if (hintFadeLoopRunning) return;
  hintFadeLoopRunning = true;
  function frame() {
    redraw();
    if (!hintFadeComplete) requestAnimationFrame(frame);
    else hintFadeLoopRunning = false;
  }
  requestAnimationFrame(frame);
}

function drawUndoHint() {
  if (!layout || !undoHintIconLoaded) return;

  let alpha = 1;
  if (!hintFadeComplete) {
    const now = performance.now();
    if (hintFirstShownTime === null) { hintFirstShownTime = now; runHintFadeLoop(); }
    const elapsed = now - hintFirstShownTime;
    if (elapsed < 2000) return;
    if (elapsed < 4000) alpha = (elapsed - 2000) / 2000;
    else hintFadeComplete = true;
  }

  const scale = PITCH / 64 * 0.7;
  const iconH = Math.round(48 * scale);
  const iconW = Math.round(iconH * 87.45 / 129.2);
  const fontSize = Math.round(32 * scale);
  const gap = Math.round(8 * scale);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${fontSize}px sans-serif`;
  const textW = ctx.measureText('undo').width;
  const startX = Math.round(canvasW / 2 - (iconW + gap + textW) / 2);
  const centerY = Math.round(layout.offsetY + layout.maxY * PITCH + TILE_SIZE + PITCH * 1.5);
  ctx.drawImage(undoHintIcon, startX, centerY - iconH / 2, iconW, iconH);
  ctx.fillStyle = '#aaa';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('undo', startX + iconW + gap, centerY);
  ctx.restore();
}

setCanvasSize(Math.round(window.innerWidth * 0.9), Math.round(window.innerHeight * 0.70));

let words: Set<string> = new Set();
let tiles: Tile[] = [];
let levelTiles: Tile[] = [];
let layout: GridLayout;
let levelNumCols = 0;
let levelNumRows = 0;
let color: Color;
let hoveredTile: Tile | null = null;
let chain: Tile[] = [];
let cursorX = 0;
let cursorY = 0;
let animating = false;
let levelComplete = false;
let history: Tile[][] = [];

// --- splashes ---

interface Splash { x: number; y: number; startTime: number; duration: number; maxRadius: number; }
let splashes: Splash[] = [];
let splashLoopRunning = false;

function activeSplashStates(now: number): SplashState[] {
  splashes = splashes.filter(s => s.startTime + s.duration > now);
  return splashes
    .filter(s => s.startTime <= now)
    .map(s => ({ x: s.x, y: s.y, progress: (now - s.startTime) / s.duration, maxRadius: s.maxRadius }));
}

function renderFrame(now = performance.now(), overrides: Parameters<typeof render>[4] = {}) {
  render(ctx, tiles, layout, color, {
    hoveredTile, chain, cursorX, cursorY,
    splashes: activeSplashStates(now),
    ...overrides,
  });
  if (history.length > 0) drawUndoHint();
  if (levelComplete) drawLevelComplete();
}

function redraw() { renderFrame(); }

function runSplashLoop() {
  if (splashLoopRunning || animating) return;
  if (splashes.length === 0) { redraw(); return; }
  splashLoopRunning = true;
  function frame(now: number) {
    if (animating) { splashLoopRunning = false; return; }
    renderFrame(now);
    if (splashes.length > 0) {
      requestAnimationFrame(frame);
    } else {
      splashLoopRunning = false;
    }
  }
  requestAnimationFrame(frame);
}

function addSplash(x: number, y: number, duration: number, maxRadius: number) {
  splashes.push({ x, y, startTime: performance.now(), duration, maxRadius });
  if (!animating) runSplashLoop();
}

// --- level complete ---

function drawLevelComplete() {
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
  const gradWidth = (layout.maxX - layout.minX) * PITCH + TILE_SIZE * (4 / 3);
  const refGradWidth = 25745 / 33; // pitch=95, 8 cols: 7*95 + (950/11)*(4/3)
  const vscale = gradWidth / refGradWidth;
  ctx.font = 'bold 96px sans-serif';
  const solvedSize = 96 * (gradWidth * 0.4) / ctx.measureText('Solved!').width;
  const dateSize = solvedSize * (32 / 96);
  ctx.font = `bold ${solvedSize}px sans-serif`;
  ctx.fillText('Solved!', canvasW / 2, canvasH / 2 - 50 * vscale);
  ctx.font = `${dateSize}px sans-serif`;
  ctx.fillText(dateStr, canvasW / 2, canvasH / 2 + 30 * vscale);
  ctx.restore();
}

// --- input ---

function isAdjacent(a: Tile, b: Tile): boolean {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && (a.x !== b.x || a.y !== b.y);
}

function distToCenter(tile: Tile, px: number, py: number): number {
  const cx = tilePixelX(tile, layout) + TILE_SIZE / 2;
  const cy = tilePixelY(tile, layout) + TILE_SIZE / 2;
  return Math.hypot(px - cx, py - cy);
}

canvas.addEventListener('mousedown', e => {
  if (animating || levelComplete || !layout) return;
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

window.addEventListener('mousemove', e => {
  if (animating || levelComplete || !layout) return;
  const rect = canvas.getBoundingClientRect();
  cursorX = e.clientX - rect.left;
  cursorY = e.clientY - rect.top;

  if (chain.length === 0) {
    const hit = tileAtPixel(tiles, cursorX, cursorY, layout);
    if (hit !== hoveredTile) { hoveredTile = hit; redraw(); }
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
      if (distToCenter(tile, cursorX, cursorY) < ADD_RADIUS) { chain.push(tile); break; }
    }
  }

  redraw();
});

canvas.addEventListener('mouseleave', () => {
  if (chain.length === 0 && hoveredTile) { hoveredTile = null; redraw(); }
});


window.addEventListener('mouseup', () => {
  if (chain.length === 0) return;
  const word = chain.map(t => t.letter).join('');
  if (words.has(word)) {
    history.push(tiles);
    const removed = new Set(chain);
    tiles = tiles.filter(t => !removed.has(t));
    chain = [];
    hoveredTile = null;
    // if (tiles.length > 0) addSplash(cursorX, cursorY, 600, TILE_SIZE * 3);
    startCascadeAnimation();
  } else {
    chain = [];
    hoveredTile = tileAtPixel(tiles, cursorX, cursorY, layout);
    redraw();
  }
});

function undo() {
  if (animating || history.length === 0) return;
  tiles = history.pop()!;
  levelComplete = false;
  chain = [];
  hoveredTile = null;
  splashes = [];
  redraw();
}

window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
  }
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  undo();
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

    renderFrame(now, { getTilePixelY: tile => yMap.get(tile) ?? tilePixelY(tile, layout) });

    if (allSettled) {
      animating = false;
      if (tiles.length === 0) {
        levelComplete = true;
        addSplash(cursorX, cursorY, 1200, Math.hypot(canvasW, canvasH));
      }
      runSplashLoop();
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
      + (tile.x - layout.minX + 1) * COLUMN_STAGGER + FALL_ENTRY_EXTRA + tile.y * PITCH * 0.5;
    return { tile, pixelY: targetPixelY - fallDistance, velocityY: 0, targetPixelY, settled: false };
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
    return { tile: newTile, pixelY: startY, velocityY: 0, targetPixelY: targetY, settled: startY === targetY };
  });

  if (fallingTiles.every(ft => ft.settled)) {
    if (tiles.length === 0) {
      levelComplete = true;
      addSplash(cursorX, cursorY, 1200, Math.hypot(canvasW, canvasH));
    }
    runSplashLoop();
    return;
  }

  runFallAnimation(fallingTiles);
}

new ResizeObserver(entries => {
  const { width, height } = entries[0].contentRect;
  setCanvasSize(Math.round(width), Math.round(height));
  if (!levelNumCols) return;
  applyScale(Math.min(canvasW / (levelNumCols + 1), canvasH / (levelNumRows + 3)));
  layout = computeLayout(levelTiles, canvasW, canvasH);
  redraw();
}).observe(canvas);

// --- init ---

const today = new Date();
let debugDateOffset = 0;

function startLevel(loadedTiles: import('./level').Tile[]) {
  const xs = loadedTiles.map(t => t.x);
  const ys = loadedTiles.map(t => t.y);
  levelNumCols = Math.max(...xs) - Math.min(...xs) + 1;
  levelNumRows = Math.max(...ys) + 1;
  applyScale(Math.min(canvasW / (levelNumCols + 1), canvasH / (levelNumRows + 3)));
  tiles = applyGravity(loadedTiles);
  levelTiles = tiles;
  color = randomLevelColor();
  const least = Math.min(color.r, color.g, color.b);
  const dist = Math.round(Math.hypot(255 - color.r, 255 - color.g, 255 - color.b));
  const luma = Math.round(0.299 * color.r + 0.587 * color.g + 0.114 * color.b);
  console.log(`rgb(${color.r}, ${color.g}, ${color.b}) — least: ${least} — distance: ${dist} — luma: ${luma}`);
  history = [];
  chain = [];
  hoveredTile = null;
  levelComplete = false;
  splashes = [];
  animating = false;
  hintFirstShownTime = null;
  hintFadeComplete = false;
  layout = computeLayout(levelTiles, canvasW, canvasH);
  startDropAnimation();
}

Promise.all([loadWords(), loadLevel(today)]).then(([loadedWords, loadedTiles]) => {
  words = loadedWords;
  startLevel(loadedTiles);
});

window.addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  debugDateOffset += e.key === 'ArrowRight' ? 1 : -1;
  const date = new Date(today.getTime() + debugDateOffset * 86400000);
  console.log(`debug: loading level for offset ${debugDateOffset}`);
  loadLevel(date).then(startLevel);
});
