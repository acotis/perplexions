import './style.css';
import { loadWords } from './words';
import { loadLevel, levelFileExists, formatDate, applyGravity } from './level';
import { randomLevelColor, computeLayout, tileAtPixel, tilePixelX, tilePixelY, render, drawHashEmojis, setPitch, TILE_SIZE, GAP } from './render';
import type { Tile, ParsedLevel } from './level';
import type { GridLayout, Color, SplashState } from './render';

let showEmojiHash = false;
const sessionHashFlags = new Map<string, boolean>();

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
let canvasW = 0;
let canvasH = 0;

function setCanvasSize(w: number, h: number) {
  const dpr = window.devicePixelRatio || 1;
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

  const fontSize = 4 * Math.min(canvasW, canvasH) / 100;
  const iconH = fontSize * 1.5;
  const iconW = iconH * 87.45 / 129.2;
  const gap = fontSize * 0.25;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${fontSize}px sans-serif`;
  const textW = ctx.measureText('undo').width;
  const startX = canvasW * 0.95 - iconW - gap - textW;
  const centerY = canvasH * 0.925;
  const textX = startX + iconW + gap;
  ctx.drawImage(undoHintIcon, startX - iconW * 0.125, centerY - iconH / 2, iconW, iconH);
  ctx.fillStyle = '#aaa';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('undo', textX, centerY);
  const pad = fontSize * 0.3;
  undoTextHit = { x: textX - pad, y: centerY - fontSize / 2 - pad, w: textW + pad * 2, h: fontSize + pad * 2 };
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
let wordHistory: string[] = [];
let currentParsedLevel: ParsedLevel | null = null;
let currentLevelDate: Date | null = null;
let clearedOnStr: string = '';
let leftChevronHit: { x: number; y: number; w: number; h: number } | null = null;
let rightChevronHit: { x: number; y: number; w: number; h: number } | null = null;
let undoTextHit: { x: number; y: number; w: number; h: number } | null = null;
let hasPrevLevel = false;
let hasNextLevel = false;

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
  if (showEmojiHash && layout) drawHashEmojis(ctx, layout, buildEmojiHash(), canvasH);
  drawDateLabel();
  undoTextHit = null;
  if (history.length > 0 && !levelComplete) drawUndoHint();
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

// --- local storage ---

const STORAGE_PREFIX = 'perplexions-';

interface LevelRecord {
  cleared?: string;
}

function clearedOnLabel(dateSlug: string): string {
  const d = new Date(`${dateSlug}T12:00:00`);
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `Cleared on ${d.getFullYear()} ${month} ${d.getDate()}`;
}

function getLevelRecord(date: Date): LevelRecord {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + formatDate(date));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function updateLevelRecord(date: Date, updates: Partial<LevelRecord>) {
  try {
    const record = getLevelRecord(date);
    localStorage.setItem(STORAGE_PREFIX + formatDate(date), JSON.stringify({ ...record, ...updates }));
  } catch {}
}

// --- level complete ---

const endCard = document.getElementById('end-card')!;
const copyBtn = document.getElementById('copy-results') as HTMLButtonElement;
const solutionHashEmojis = document.getElementById('solution-hash-emojis') as HTMLSpanElement;

const creditsCard = document.getElementById('credits-card')!;
const creditsOverlay = document.createElement('div');
creditsOverlay.id = 'credits-overlay';
creditsOverlay.style.display = 'none';
document.body.appendChild(creditsOverlay);

const endCardOverlay = document.createElement('div');
endCardOverlay.id = 'end-card-overlay';
endCardOverlay.style.display = 'none';
document.body.appendChild(endCardOverlay);

document.getElementById('credits-btn')!.addEventListener('click', () => {
  creditsCard.hidden = false;
  creditsOverlay.style.display = 'block';
});

creditsOverlay.addEventListener('click', () => {
  creditsCard.hidden = true;
  creditsOverlay.style.display = 'none';
});

function buildResultsString(): string {
  const date = currentLevelDate ?? new Date();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const dateLabel = `${date.getFullYear()} ${month} ${date.getDate()}`;
  const dateSlug = formatDate(date);
  const wordEmojis = wordHistory.map(w => WORD_EMOJIS[hashString(`${dateSlug} ${w}`) % WORD_EMOJIS.length]);
  return [`Perplexions ${dateLabel} — ${wordEmojis.join(' ')}`, `https://fire.casa/perplexions/?date=${dateSlug}`].join('\n');
}

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(buildResultsString());
  copyBtn.style.width = `${copyBtn.offsetWidth}px`;
  copyBtn.textContent = 'Copied!';
});

function buildEmojiHash(): string[] {
  const dateSlug = formatDate(currentLevelDate ?? new Date());
  return wordHistory.map(w => WORD_EMOJIS[hashString(`${dateSlug} ${w}`) % WORD_EMOJIS.length]);
}

function showEndCard() {
  if (currentLevelDate && !getLevelRecord(currentLevelDate).cleared) {
    const slug = formatDate(new Date());
    updateLevelRecord(currentLevelDate, { cleared: slug });
    clearedOnStr = clearedOnLabel(slug);
  }
  solutionHashEmojis.textContent = buildEmojiHash().join('');
  const { r, g, b } = color;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  copyBtn.style.backgroundColor = `rgb(${r},${g},${b})`;
  copyBtn.style.color = luma > 160 ? '#000' : '#fff';
  endCard.removeAttribute('hidden');
  endCardOverlay.style.display = 'block';
  updateEmojiHashFontSize();
}
function hideEndCard() {
  endCard.setAttribute('hidden', '');
  endCardOverlay.style.display = 'none';
  copyBtn.style.width = '';
  copyBtn.style.backgroundColor = '';
  copyBtn.style.color = '';
  copyBtn.textContent = 'Copy results';
}

document.getElementById('replay')!.addEventListener('click', () => {
  if (currentParsedLevel && currentLevelDate) {
    startLevel(currentParsedLevel, currentLevelDate);
    showEmojiHash = true;
    sessionHashFlags.set(formatDate(currentLevelDate), true);
  }
});

document.getElementById('replay-no-hash')!.addEventListener('click', () => {
  if (currentParsedLevel && currentLevelDate) {
    startLevel(currentParsedLevel, currentLevelDate);
    showEmojiHash = false;
    sessionHashFlags.set(formatDate(currentLevelDate), false);
  }
});

// --- input ---

function isAdjacent(a: Tile, b: Tile): boolean {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && (a.x !== b.x || a.y !== b.y);
}

function distToCenter(tile: Tile, px: number, py: number): number {
  const cx = tilePixelX(tile, layout) + TILE_SIZE / 2;
  const cy = tilePixelY(tile, layout) + TILE_SIZE / 2;
  return Math.hypot(px - cx, py - cy);
}

function checkPrevLevel() {
  hasPrevLevel = false;
  if (!currentLevelDate) return;
  const prev = new Date(currentLevelDate.getTime() - 86400000);
  levelFileExists(prev).then(exists => {
    hasPrevLevel = exists;
    if (levelNumCols) redraw();
    if (exists) levelFileExists(new Date(prev.getTime() - 86400000));
  });
}

function checkNextLevel() {
  hasNextLevel = false;
  if (!currentLevelDate) return;
  const next = new Date(currentLevelDate.getTime() + 86400000);
  if (next.getTime() > effectiveToday.getTime()) return;
  levelFileExists(next).then(exists => {
    hasNextLevel = exists;
    if (levelNumCols) redraw();
    if (exists) levelFileExists(new Date(next.getTime() + 86400000));
  });
}

function navigateByDays(delta: number) {
  const base = currentLevelDate ?? today;
  const date = new Date(base.getTime() + delta * 86400000);
  loadLevel(date).then(parsed => {
    startLevel(parsed, date);
    window.history.pushState(null, '', `?date=${formatDate(date)}`);
  }).catch(() => {
    if (delta < 0) hasPrevLevel = false;
    if (delta > 0) hasNextLevel = false;
    redraw();
  });
}

function hitTest(r: { x: number; y: number; w: number; h: number }, px: number, py: number) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  cursorX = e.clientX - rect.left;
  cursorY = e.clientY - rect.top;
  if (leftChevronHit && hitTest(leftChevronHit, cursorX, cursorY)) { navigateByDays(-1); return; }
  if (rightChevronHit && hitTest(rightChevronHit, cursorX, cursorY)) { navigateByDays(1); return; }
  if (undoTextHit && hitTest(undoTextHit, cursorX, cursorY)) { undo(); return; }
  if (animating || levelComplete || !layout) return;
  const hit = tileAtPixel(tiles, cursorX, cursorY, layout);
  if (hit) {
    chain = [hit];
    hoveredTile = null;
    redraw();
  }
});

window.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  cursorX = e.clientX - rect.left;
  cursorY = e.clientY - rect.top;
  const overChevron = (leftChevronHit && hitTest(leftChevronHit, cursorX, cursorY)) ||
                      (rightChevronHit && hitTest(rightChevronHit, cursorX, cursorY)) ||
                      (undoTextHit && hitTest(undoTextHit, cursorX, cursorY));
  canvas.style.cursor = overChevron ? 'pointer' : '';
  if (animating || levelComplete || !layout) return;

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
    wordHistory.push(word.toUpperCase());
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
  wordHistory.pop();
  levelComplete = false;
  hideEndCard();
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
  if (!levelComplete) undo();
});

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  cursorX = touch.clientX - rect.left;
  cursorY = touch.clientY - rect.top;
  if (leftChevronHit && hitTest(leftChevronHit, cursorX, cursorY)) { navigateByDays(-1); return; }
  if (rightChevronHit && hitTest(rightChevronHit, cursorX, cursorY)) { navigateByDays(1); return; }
  if (undoTextHit && hitTest(undoTextHit, cursorX, cursorY)) { undo(); return; }
  if (animating || levelComplete || !layout) return;
  const hit = tileAtPixel(tiles, cursorX, cursorY, layout);
  if (hit) { chain = [hit]; hoveredTile = null; redraw(); }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  cursorX = touch.clientX - rect.left;
  cursorY = touch.clientY - rect.top;
  if (animating || levelComplete || !layout || chain.length === 0) return;

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
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (chain.length === 0) return;
  const word = chain.map(t => t.letter).join('');
  if (words.has(word)) {
    history.push(tiles);
    wordHistory.push(word.toUpperCase());
    const removed = new Set(chain);
    tiles = tiles.filter(t => !removed.has(t));
    chain = [];
    hoveredTile = null;
    startCascadeAnimation();
  } else {
    chain = [];
    hoveredTile = null;
    redraw();
  }
}, { passive: false });

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
        setTimeout(showEndCard, 2000);
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
      setTimeout(showEndCard, 2000);
      addSplash(cursorX, cursorY, 1200, Math.hypot(canvasW, canvasH));
    }
    runSplashLoop();
    return;
  }

  runFallAnimation(fallingTiles);
}

function updateCanvasLayout() {
  if (!levelNumCols) return;
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const regionTop = viewH * 0.085;
  const regionH = viewH * 0.75;
  const pitch = Math.min((viewW * 0.90) / (levelNumCols + 1), regionH / (levelNumRows + 1.5));
  applyScale(pitch);
  const contentH = (levelNumRows + 1.5) * pitch;
  const offsetY = regionTop + (regionH - contentH) / 2 + PITCH * 0.85;
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
  canvas.style.left = '0';
  canvas.style.top = '0';
  setCanvasSize(viewW, viewH);
  layout = computeLayout(levelTiles, canvasW, canvasH, levelNumCols, offsetY);
}

const endCardH1 = document.querySelector('#end-card h1') as HTMLElement;
const solutionHashLabel = document.querySelector('.solution-hash-label') as HTMLElement;

function updateEndCardFontSize() {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const maxPx = rem * 2.475;
  const cardWidth = Math.min(Math.max(window.innerWidth * 0.5, 350), window.innerWidth * 0.85);
  const contentWidth = cardWidth - 4 * rem;
  const targetWidth = contentWidth * 0.90;
  ctx.font = '100px sans-serif';
  const fitPx = 100 * targetWidth / ctx.measureText('Level cleared!').width;
  endCardH1.style.fontSize = `${Math.min(maxPx, fitPx)}px`;
  const labelMaxPx = rem * 1.125;
  const labelFitPx = 100 * contentWidth * 0.80 / ctx.measureText('SOLUTION HASH').width;
  solutionHashLabel.style.fontSize = `${Math.min(labelMaxPx, labelFitPx)}px`;
  updateEmojiHashFontSize(contentWidth);
}

function updateEmojiHashFontSize(contentWidth?: number) {
  if (endCard.hasAttribute('hidden')) return;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const cw = contentWidth ?? (Math.min(Math.max(window.innerWidth * 0.5, 350), window.innerWidth * 0.85) - 4 * rem);
  const maxWidth = cw * 0.90;
  solutionHashEmojis.style.fontSize = `${rem * 2.2}px`;
  solutionHashEmojis.style.width = 'max-content';
  const naturalWidth = solutionHashEmojis.getBoundingClientRect().width;
  solutionHashEmojis.style.width = '';
  if (naturalWidth > maxWidth) {
    solutionHashEmojis.style.fontSize = `${rem * 2.2 * maxWidth / naturalWidth}px`;
  }
}

function onResize() {
  updateCanvasLayout();
  updateEndCardFontSize();
  if (levelNumCols) redraw();
}

new ResizeObserver(onResize).observe(document.documentElement);
window.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('resize', onResize);
window.addEventListener('pageshow', e => { if (e.persisted) onResize(); });
window.addEventListener('popstate', () => {
  const param = new URLSearchParams(window.location.search).get('date');
  const date = param ? new Date(`${param}T12:00:00`) : effectiveToday;
  loadLevel(date).then(parsed => startLevel(parsed, date));
});

// --- init ---

const dateParam = new URLSearchParams(window.location.search).get('date');
const today = new Date();
const effectiveToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

const WORD_EMOJIS = [
  '🔥','💭','😭','😏','🤭','😂','🥺','🙂‍↔️','💚','😶','🙄','😬','🤧','😩','✊','👈','👉','👆','👇','🍎',
  '🧚','👕','😎',
  '🐱','🦊','🐰','🐭','🐸','🐦','🐣','🙉','🙊','🙈','🪿','🦆','🦅','🦉','🦇','🐝','🪱','🐛','🦋','🐌','🐞','🪲','🪳','🦗','🐙','🐍','🪼','🦐','🐠','🐟','🦀','🐅','🦒','🐑','🐖','🐈','🪶','🐓','🪽','🦃','🦜',
  '🌳','🍄','🪹','🪺','🍂','🍁','🌵','🌱','🍃','🌺','🌹',
  '🌑','🌕','⭐','☀️','☄️','🌧️','⛈️','💦','☂️',
  '🙂‍↕️','🍊','🍋','🍇','🍑','🍆','🍌','🥬','🫑','🥕','🌽','🧅','🦴','🥫','🧁','🍦','🍨','🍭','🎂','🫘','🍷',
  '⚽','🏀','🏈','⚾','🎾','🏹','🎣','🪁','🎱','🏆','🧩','🎷','🚀','🛸','⛏️','🪛','💎','💊','🧼','🔑','🪄','📌','✏️',
  '🩷','❤️','🧡','💛','✅','🩵','💙','💜','🩶','🤍','🤎',
  '▶️','⏸️','⏹️','🎵','⬜','🟠','🟦','🟥','🟫','🟣','🟩','🟨','🕒','🕣',
  '🍓','🍒','🥝','🌻','🌈','🍀','🐧','🎯','🎲','🔮',
];

function dateSeed(date: Date): number {
  const s = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return hashString(s);
}

let dateStr = '';

function drawDateLabel() {
  if (!dateStr) return;
  const fontSize = 3 * Math.min(canvasW, canvasH) / 100;
  const centerY = canvasH * 0.925;
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = '#666';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const dateOffset = clearedOnStr ? fontSize * 1.136025 / 2 : 0;
  const dateY = centerY - dateOffset;
  ctx.fillText(dateStr, canvasW / 2, dateY);
  const textW = ctx.measureText(dateStr).width;

  if (clearedOnStr) {
    ctx.font = `${fontSize * 0.675}px sans-serif`;
    ctx.fillStyle = '#999';
    ctx.fillText(clearedOnStr, canvasW / 2, dateY + fontSize * 1.136025);
  }
  const h = fontSize * 0.55;
  const w = fontSize * 0.30;
  const gap = fontSize * 1.21;
  ctx.strokeStyle = '#666';
  ctx.lineWidth = fontSize * 0.12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const chevronY = centerY - fontSize * 0.07;
  const pad = fontSize * 1.0;
  const showLeft = hasPrevLevel;
  const showRight = hasNextLevel;

  leftChevronHit = null;
  if (showLeft) {
    const lx = canvasW / 2 - textW / 2 - gap;
    leftChevronHit = { x: lx - w - pad, y: chevronY - h / 2 - pad, w: w + pad * 2, h: h + pad * 2 };
    ctx.beginPath();
    ctx.moveTo(lx, chevronY - h / 2);
    ctx.lineTo(lx - w, chevronY);
    ctx.lineTo(lx, chevronY + h / 2);
    ctx.stroke();
  }

  rightChevronHit = null;
  if (showRight) {
    const rx = canvasW / 2 + textW / 2 + gap;
    rightChevronHit = { x: rx - pad, y: chevronY - h / 2 - pad, w: w + pad * 2, h: h + pad * 2 };
    ctx.beginPath();
    ctx.moveTo(rx, chevronY - h / 2);
    ctx.lineTo(rx + w, chevronY);
    ctx.lineTo(rx, chevronY + h / 2);
    ctx.stroke();
  }

  ctx.restore();
}

function startLevel(parsed: ParsedLevel, date: Date) {
  currentParsedLevel = parsed;
  currentLevelDate = date;
  const { tiles: loadedTiles, numCols, numRows } = parsed;
  const month = date.toLocaleString('en-US', { month: 'short' });
  dateStr = `Perplexions — ${date.getFullYear()} ${month} ${date.getDate()}`;
  levelNumCols = numCols;
  levelNumRows = numRows;
  tiles = applyGravity(loadedTiles);
  levelTiles = tiles;
  color = randomLevelColor(dateSeed(date));
  const least = Math.min(color.r, color.g, color.b);
  const dist = Math.round(Math.hypot(255 - color.r, 255 - color.g, 255 - color.b));
  const luma = Math.round(0.299 * color.r + 0.587 * color.g + 0.114 * color.b);
  console.log(`rgb(${color.r}, ${color.g}, ${color.b}) — least: ${least} — distance: ${dist} — luma: ${luma}`);
  history = [];
  wordHistory = [];
  showEmojiHash = sessionHashFlags.get(formatDate(date)) ?? false;
  const storedCleared = getLevelRecord(date).cleared;
  clearedOnStr = storedCleared ? clearedOnLabel(storedCleared) : '';
  chain = [];
  hoveredTile = null;
  levelComplete = false;
  hideEndCard();
  splashes = [];
  animating = false;
  hintFirstShownTime = null;
  hintFadeComplete = false;
  checkPrevLevel();
  checkNextLevel();
  updateCanvasLayout();
  updateEndCardFontSize();
  startDropAnimation();
}

const toastContainer = document.getElementById('toast-container')!;
function showToast(msg: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function showCanvasError(msg: string) {
  setCanvasSize(window.innerWidth, window.innerHeight);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = '#888';
  ctx.font = '1.5rem sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, canvasW / 2, canvasH / 2);
}

async function init() {
  const wordsPromise = loadWords();
  const todayNoon = effectiveToday;
  let date = todayNoon;
  let parsed: ParsedLevel | null = null;
  let dateParamFailed = false;

  if (dateParam) {
    const requested = new Date(`${dateParam}T12:00:00`);
    try {
      parsed = await loadLevel(requested);
      date = requested;
    } catch {
      dateParamFailed = true;
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  if (!parsed) {
    try {
      parsed = await loadLevel(todayNoon);
      if (dateParamFailed) showToast("Couldn't load requested level — loaded today's level instead");
    } catch {
      const searchLower = new Date('2026-07-01T12:00:00');
      const searchUpper = new Date(effectiveToday.getTime() - 86400000);

      if (searchUpper.getTime() >= searchLower.getTime()) {
        const days = Math.round((searchUpper.getTime() - searchLower.getTime()) / 86400000);
        let lo = 0, hi = days, best = -1;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const midDate = new Date(searchLower.getTime() + mid * 86400000);
          if (await levelFileExists(midDate)) { best = mid; lo = mid + 1; }
          else { hi = mid - 1; }
        }
        if (best >= 0) {
          const bestDate = new Date(searchLower.getTime() + best * 86400000);
          try {
            parsed = await loadLevel(bestDate);
            date = bestDate;
            const p = new URLSearchParams(window.location.search);
            p.set('date', formatDate(bestDate));
            window.history.replaceState(null, '', `?${p}`);
            showToast(dateParamFailed
              ? "Couldn't load requested level or today's level — loaded latest published level instead"
              : "Couldn't load today's level — loaded latest published level instead");
          } catch { /* fall through to error */ }
        }
      }

      if (!parsed) {
        words = await wordsPromise;
        showCanvasError("Couldn't load today's puzzle.");
        return;
      }
    }
  }

  words = await wordsPromise;
  startLevel(parsed, date);
}

init();

