import './style.css';
import { loadWords } from './words';
import { loadLevel, levelFileExists, formatDate, applyGravity } from './level';
import { randomLevelColor, toDarkLevelColor, luma, computeLayout, tileAtPixel, tilePixelX, tilePixelY, render, drawSplash, drawHashEmojis, setPitch, TILE_SIZE, GAP } from './render';
import type { Tile, ParsedLevel } from './level';
import type { GridLayout, Color, SplashState } from './render';
import { currentPalette, isDark, setDarkMode } from './theme';
import { setupHowtoTutorial } from './tutorial';
import { hashString } from './hash';
import { importTransfer, STORAGE_PREFIX, SETTINGS_PREFIX } from './transfer';

// Absorb any localStorage handed over from the old fire.casa origin (see
// transfer.ts) before any settings or level records are read below.
importTransfer();

let showEmojiHash = false;
let hardMode = false;

// I am fully aware that the password mechanism here is client-side only and bullshit, but I thought it was funny and so I did it.
const DEV_SALT = '0a437c5ffac39f35596e10a60cce58e2';
const DEV_HASH = '2762dbfb59481f01afc3931051f9c3bef04627504c15d8aaa34091bdfc1bbb50';

let devMode = false;

async function checkDevPassword(password: string): Promise<boolean> {
  if (!DEV_SALT || !DEV_HASH) return false;
  const toBytes = (hex: string) => new Uint8Array(hex.match(/../g)!.map(b => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: toBytes(DEV_SALT), iterations: 100_000 },
    keyMaterial, 256,
  );
  return [...new Uint8Array(derived)].map(b => b.toString(16).padStart(2, '0')).join('') === DEV_HASH;
}

const devPasswordParam = new URLSearchParams(window.location.search).get('dev-password');
const devPasswordPromise = devPasswordParam ? checkDevPassword(devPasswordParam) : Promise.resolve(false);

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

const undoIcon = new Image();
let undoIconLoaded = false;
undoIcon.onload = () => { undoIconLoaded = true; };
undoIcon.src = import.meta.env.BASE_URL + 'undo.svg';

// Light-gray copy of the (solid black) undo icon for dark mode, tinted via
// source-in compositing on an offscreen canvas. ctx.filter would be simpler,
// but WebKit never shipped it, so on iOS the filter silently no-ops and the
// icon stayed black on the dark background.
let darkUndoIconCanvas: HTMLCanvasElement | null = null;

function darkUndoIcon(sizePx: number): HTMLCanvasElement {
  if (darkUndoIconCanvas && darkUndoIconCanvas.width === sizePx) return darkUndoIconCanvas;
  const off = document.createElement('canvas');
  off.width = sizePx;
  off.height = sizePx;
  const octx = off.getContext('2d')!;
  octx.drawImage(undoIcon, 0, 0, sizePx, sizePx);
  octx.globalCompositeOperation = 'source-in';
  // Matches what invert(1) brightness(0.82) produced from solid black.
  octx.fillStyle = 'rgb(209,209,209)';
  octx.fillRect(0, 0, sizePx, sizePx);
  darkUndoIconCanvas = off;
  return off;
}

let undoIconFirstShownTime: number | null = null;
let undoIconFadeComplete = false;
let undoIconFadeLoopRunning = false;

function runUndoIconFadeLoop() {
  if (undoIconFadeLoopRunning) return;
  undoIconFadeLoopRunning = true;
  function frame() {
    redraw();
    if (!undoIconFadeComplete) requestAnimationFrame(frame);
    else undoIconFadeLoopRunning = false;
  }
  requestAnimationFrame(frame);
}

function drawUndoIcon() {
  if (!undoIconLoaded) return;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const size = Math.max(Math.min(canvasW, canvasH) * 0.06, 2.7 * rem);
  const pad = size * 0.5;

  const fullAlpha = isDark() ? 0.65 : 0.525;
  let alpha = fullAlpha;
  if (!undoIconFadeComplete) {
    const now = performance.now();
    if (undoIconFirstShownTime === null) { undoIconFirstShownTime = now; runUndoIconFadeLoop(); }
    const elapsed = now - undoIconFirstShownTime;
    if (elapsed < 2000) return;
    if (elapsed < 4000) alpha = fullAlpha * (elapsed - 2000) / 2000;
    else undoIconFadeComplete = true;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  // The icon art is solid black; in dark mode swap in the light-gray copy so
  // it reads against the dark background.
  const dpr = window.devicePixelRatio || 1;
  const icon = isDark() ? darkUndoIcon(Math.max(1, Math.round(size * dpr))) : undoIcon;
  ctx.drawImage(icon, pad, pad, size, size);
  ctx.restore();
  undoIconHit = { x: 0, y: 0, w: size + pad * 2, h: size + pad * 2 };
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
let endCardTimer: ReturnType<typeof setTimeout> | null = null;
let history: Tile[][] = [];
let wordHistory: string[] = [];
let currentParsedLevel: ParsedLevel | null = null;
let currentLevelDate: Date | null = null;
let clearedOnStr: string = '';
let leftChevronHit: { x: number; y: number; w: number; h: number } | null = null;
let rightChevronHit: { x: number; y: number; w: number; h: number } | null = null;
let undoIconHit: { x: number; y: number; w: number; h: number } | null = null;
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
    .map(s => {
      const p = (now - s.startTime) / s.duration;
      return {
        x: s.x,
        y: s.y,
        progress: p,
        // Ease-out-expo: most of the expansion lands in the first ~20% of the
        // splash's life, which reads as a shockwave rather than a steady wipe.
        radius: 1.5 * s.maxRadius * (1 - Math.pow(2, -1.4 * p)),
      };
    });
}

// The on-screen candy color, enriched for dark mode (see toDarkLevelColor).
function themedColor(): Color {
  return isDark() ? toDarkLevelColor(color) : color;
}

function updateCopyButtonColor() {
  const c = themedColor();
  copyBtn.style.backgroundColor = `rgb(${c.r},${c.g},${c.b})`;
  copyBtn.style.color = luma(c) > 160 ? '#000' : '#fff';
}

function renderFrame(now = performance.now(), overrides: Parameters<typeof render>[5] = {}) {
  const palette = currentPalette();
  render(ctx, tiles, layout, themedColor(), palette, {
    hoveredTile, chain, cursorX, cursorY,
    splashes: activeSplashStates(now),
    hardMode,
    ...overrides,
  });
  if (showEmojiHash && layout) drawHashEmojis(ctx, layout, buildEmojiHash(), canvasH);
  drawDateLabel();
  undoIconHit = null;
  if (history.length > 0 && !levelComplete) drawUndoIcon();
}

function redraw() { renderFrame(); }

// Canvas text drawn before a webfont finishes loading keeps the fallback
// font, so repaint the emoji hash once the emoji font arrives. (DOM text
// reflows on its own; only the canvas needs this.)
document.fonts.load("1rem 'Perplexions Emoji'").then(() => { if (layout) redraw(); });

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

// TEMPORARY (splash-tuning branch): when enabled, init() skips the game
// entirely and fires end-of-level color bursts one after another on an empty
// canvas, so the splash curves above can be eyeballed in isolation. Goes
// through the real activeSplashStates/drawSplash pipeline, at the same
// duration and maxRadius completeLevel uses.
const SPLASH_DEMO = true;

function runSplashDemo() {
  for (const id of ['credits-btn', 'settings-btn', 'howto-btn']) {
    document.getElementById(id)!.style.display = 'none';
  }
  const resize = () => setCanvasSize(Math.round(window.innerWidth * 0.9), Math.round(window.innerHeight * 0.70));
  resize();
  window.addEventListener('resize', resize);

  const fire = () => {
    color = randomLevelColor((Math.random() * 2 ** 32) >>> 0);
    splashes.push({
      x: canvasW * (0.2 + Math.random() * 0.6),
      y: canvasH * (0.2 + Math.random() * 0.6),
      startTime: performance.now(),
      duration: 1200,
      maxRadius: Math.hypot(canvasW, canvasH),
    });
  };
  fire();
  setInterval(fire, 1600);

  function frame(now: number) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = currentPalette().background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    for (const s of activeSplashStates(now)) drawSplash(ctx, s, themedColor());
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// --- local storage ---

interface LevelRecord {
  cleared?: string;
  clearedHard?: string;
}

function clearedOnLabel(dateSlug: string, hard: boolean): string {
  const d = new Date(`${dateSlug}T12:00:00`);
  const month = d.toLocaleString('en-US', { month: 'short' });
  const date = `${d.getFullYear()} ${month} ${d.getDate()}`;
  return hard ? `Hard mode cleared on ${date}` : `Cleared on ${date}`;
}

function clearedOnLabelFor(record: LevelRecord): string {
  if (record.clearedHard) return clearedOnLabel(record.clearedHard, true);
  if (record.cleared) return clearedOnLabel(record.cleared, false);
  return '';
}

function getLevelRecord(date: Date): LevelRecord {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + formatDate(date));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function updateShowEmojiHash(record: LevelRecord) {
  const completedBefore = !!(hardMode ? record.clearedHard : record.cleared);
  showEmojiHash = completedBefore ? showHashCompletedCheckbox.checked : showHashFirstCheckbox.checked;
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
const replayHardBtn = document.getElementById('replay-no-hash') as HTMLButtonElement;
const hardModeTag = document.getElementById('hard-mode-tag') as HTMLParagraphElement;
const solutionHashEmojis = document.getElementById('solution-hash-emojis') as HTMLSpanElement;

// Overlays fade via the .overlay-visible class (opacity transition); they start
// hidden by CSS default, so creation just appends them.
const showOverlay = (o: HTMLElement) => {
  o.classList.add('overlay-visible');
  if (hoveredTile) { hoveredTile = null; redraw(); }
};
const hideOverlay = (o: HTMLElement) => o.classList.remove('overlay-visible');
const isOverlayVisible = (o: HTMLElement) => o.classList.contains('overlay-visible');

const creditsCard = document.getElementById('credits-card')!;
const creditsOverlay = document.createElement('div');
creditsOverlay.id = 'credits-overlay';
document.body.appendChild(creditsOverlay);

const endCardOverlay = document.createElement('div');
endCardOverlay.id = 'end-card-overlay';
document.body.appendChild(endCardOverlay);

// Transparent full-screen shield that swallows every pointer event during the
// gap between clearing a level and the end card appearing. Without it, the
// chevrons/undo and the menu buttons stay live in that window (see
// completeLevel), letting the player navigate away or stack a menu under the
// end card. The end-card overlay takes over the blocking once the card shows.
const inputShield = document.createElement('div');
inputShield.id = 'input-shield';
document.body.appendChild(inputShield);

endCardOverlay.addEventListener('click', () => {
  if (currentParsedLevel && currentLevelDate) {
    startLevel(currentParsedLevel, currentLevelDate, hardMode);
  }
});

document.getElementById('credits-btn')!.addEventListener('click', () => {
  creditsCard.hidden = false;
  showOverlay(creditsOverlay);
});

creditsOverlay.addEventListener('click', () => {
  hideOverlay(creditsOverlay);
  creditsCard.classList.add('sweeping-out');
  creditsCard.addEventListener('animationend', () => {
    creditsCard.hidden = true;
    creditsCard.classList.remove('sweeping-out');
  }, { once: true });
});

const settingsCard = document.getElementById('settings-card')!;
const settingsOverlay = document.createElement('div');
settingsOverlay.id = 'settings-overlay';
document.body.appendChild(settingsOverlay);

function getSetting(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_PREFIX + key);
    return raw === null ? fallback : raw === 'true';
  } catch { return fallback; }
}

function setSetting(key: string, value: boolean) {
  try {
    localStorage.setItem(SETTINGS_PREFIX + key, String(value));
  } catch {}
}

const showHashCompletedCheckbox = document.getElementById('setting-show-hash-completed') as HTMLInputElement;
const showHashFirstCheckbox = document.getElementById('setting-show-hash-first') as HTMLInputElement;
const hardModeCheckbox = document.getElementById('setting-hard-mode') as HTMLInputElement;
const darkModeCheckbox = document.getElementById('setting-dark-mode') as HTMLInputElement;

showHashCompletedCheckbox.checked = getSetting('show-hash', true);
showHashFirstCheckbox.checked = getSetting('show-hash-first', false);
hardModeCheckbox.checked = getSetting('hard-mode', false);

// Default to dark mode on first visit (until the user toggles it, which
// persists): most players prefer dark, and the majority never change their
// system's light default. Overrides the system's prefers-color-scheme.
darkModeCheckbox.checked = getSetting('dark-mode', true);
setDarkMode(darkModeCheckbox.checked);

showHashCompletedCheckbox.addEventListener('change', () => {
  setSetting('show-hash', showHashCompletedCheckbox.checked);
  if (currentLevelDate) { updateShowEmojiHash(getLevelRecord(currentLevelDate)); redraw(); }
});
showHashFirstCheckbox.addEventListener('change', () => {
  setSetting('show-hash-first', showHashFirstCheckbox.checked);
  if (currentLevelDate) { updateShowEmojiHash(getLevelRecord(currentLevelDate)); redraw(); }
});
hardModeCheckbox.addEventListener('change', () => {
  setSetting('hard-mode', hardModeCheckbox.checked);
  if (currentParsedLevel && currentLevelDate) startLevel(currentParsedLevel, currentLevelDate);
});
darkModeCheckbox.addEventListener('change', () => {
  setSetting('dark-mode', darkModeCheckbox.checked);
  setDarkMode(darkModeCheckbox.checked);
  updateCopyButtonColor();
  redraw();
});

function setButtonIcon(selector: string, file: string) {
  const icon = document.querySelector(selector) as HTMLElement;
  const url = `url(${import.meta.env.BASE_URL}${file})`;
  icon.style.setProperty('-webkit-mask-image', url);
  icon.style.setProperty('mask-image', url);
}
setButtonIcon('#credits-btn .btn-icon', 'credits.svg');
setButtonIcon('#settings-btn .btn-icon', 'settings.svg');
setButtonIcon('#howto-btn .btn-icon', 'help.svg');

document.getElementById('settings-btn')!.addEventListener('click', () => {
  settingsCard.hidden = false;
  showOverlay(settingsOverlay);
});

settingsOverlay.addEventListener('click', () => {
  hideOverlay(settingsOverlay);
  settingsCard.classList.add('sweeping-out');
  settingsCard.addEventListener('animationend', () => {
    settingsCard.hidden = true;
    settingsCard.classList.remove('sweeping-out');
  }, { once: true });
});

const howtoCard = document.getElementById('howto-card')!;
const howtoOverlay = document.createElement('div');
howtoOverlay.id = 'howto-overlay';
document.body.appendChild(howtoOverlay);

const howtoTutorial = setupHowtoTutorial(document.getElementById('howto-canvas') as HTMLCanvasElement);

const howtoBtn = document.getElementById('howto-btn')!;
howtoBtn.addEventListener('click', () => {
  howtoCard.hidden = false;
  showOverlay(howtoOverlay);
  howtoTutorial.start();
});

// Pop the how-to card automatically on a player's first visit, exactly as if
// they'd clicked the button. Any pre-existing perplexions- key (level records,
// settings, data migrated from fire.casa) marks a returning player from before
// this flag existed — set the flag silently for them rather than re-showing a
// tutorial they've already seen. If localStorage is unavailable we can't
// remember having shown it, so never auto-show rather than nag every visit.
function maybeShowFirstVisitHowto() {
  try {
    if (getSetting('seen-howto', false)) return;
    let returning = false;
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith(STORAGE_PREFIX)) { returning = true; break; }
    }
    setSetting('seen-howto', true);
    if (!returning) howtoBtn.click();
  } catch {}
}

howtoOverlay.addEventListener('click', () => {
  hideOverlay(howtoOverlay);
  howtoTutorial.stop();
  howtoCard.classList.add('sweeping-out');
  howtoCard.addEventListener('animationend', () => {
    howtoCard.hidden = true;
    howtoCard.classList.remove('sweeping-out');
  }, { once: true });
});

// Escape dismisses whichever card is shown, as if its overlay were clicked.
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  for (const overlay of [creditsOverlay, settingsOverlay, howtoOverlay, endCardOverlay]) {
    if (isOverlayVisible(overlay)) { overlay.click(); break; }
  }
});

// Each card's close button dismisses it like clicking its overlay.
const cardCloseTargets: [HTMLElement, HTMLElement][] = [
  [creditsCard, creditsOverlay],
  [settingsCard, settingsOverlay],
  [howtoCard, howtoOverlay],
  [endCard, endCardOverlay],
];
for (const [card, overlay] of cardCloseTargets) {
  card.querySelector('.card-close')!.addEventListener('click', () => overlay.click());
}

function buildResultsString(): string {
  const date = currentLevelDate ?? new Date();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const dateLabel = `${date.getFullYear()} ${month} ${date.getDate()}${hardMode ? ' (hard mode)' : ''}`;
  const dateSlug = formatDate(date);
  const wordEmojis = wordHistory.map(w => WORD_EMOJIS[hashString(`${dateSlug} ${w}`) % WORD_EMOJIS.length]);
  // Share links use the /puzzle/ path: it serves the same app, but its HTML
  // has no social-embed tags, so pasted results don't unfurl (see
  // scripts/build-share-page.js). The bare-domain page keeps the embed tags.
  return [`Perplexions ${dateLabel} — ${wordEmojis.join(' ')}`, `https://perplexions.io/puzzle/?date=${dateSlug}`].join('\n');
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
  // The clear was persisted in completeLevel; reflect it in the on-board
  // "cleared on" sub-label now, so its timing matches the card's appearance.
  if (currentLevelDate && !isExperimental) {
    clearedOnStr = clearedOnLabelFor(getLevelRecord(currentLevelDate));
  }
  solutionHashEmojis.textContent = buildEmojiHash().join('');
  updateCopyButtonColor();
  replayHardBtn.textContent = hardMode ? 'Replay on normal mode' : 'Replay on hard mode';
  copyBtn.textContent = hardMode ? 'Copy hard-mode results' : 'Copy results';
  hardModeTag.hidden = !hardMode;
  endCard.removeAttribute('hidden');
  showOverlay(endCardOverlay);
  // The end-card overlay now blocks input; hand off from the shield. The timer
  // has fired, so drop the reference (the reveal is no longer pending).
  endCardTimer = null;
  inputShield.style.display = 'none';
  updateEmojiHashFontSize();
  redraw();
}
function hideEndCard() {
  endCard.setAttribute('hidden', '');
  hideOverlay(endCardOverlay);
  // If the level is reset during the limbo window (before the end card shows),
  // cancel the pending reveal so it can't fire on the newly-loaded level, and
  // make sure the shield doesn't stay up blocking input.
  if (endCardTimer !== null) { clearTimeout(endCardTimer); endCardTimer = null; }
  inputShield.style.display = 'none';
  copyBtn.style.width = '';
  copyBtn.style.backgroundColor = '';
  copyBtn.style.color = '';
  copyBtn.textContent = 'Copy results';
}

document.getElementById('replay')!.addEventListener('click', () => {
  if (currentParsedLevel && currentLevelDate) {
    startLevel(currentParsedLevel, currentLevelDate, hardMode);
  }
});

replayHardBtn.addEventListener('click', () => {
  if (currentParsedLevel && currentLevelDate) {
    startLevel(currentParsedLevel, currentLevelDate, !hardMode);
  }
});

// --- input ---

function isAdjacent(a: Tile, b: Tile): boolean {
  if (hardMode) return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
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
  levelFileExists(prev, devMode).then(exists => {
    hasPrevLevel = exists;
    if (levelNumCols) redraw();
    if (exists) levelFileExists(new Date(prev.getTime() - 86400000), devMode);
  });
}

function checkNextLevel() {
  hasNextLevel = false;
  if (!currentLevelDate) return;
  const next = new Date(currentLevelDate.getTime() + 86400000);
  if (!devMode && next.getTime() > effectiveToday.getTime()) return;
  levelFileExists(next, devMode).then(exists => {
    hasNextLevel = exists;
    if (levelNumCols) redraw();
    if (exists) levelFileExists(new Date(next.getTime() + 86400000), devMode);
  });
}

function navigateByDays(delta: number) {
  const base = currentLevelDate ?? today;
  const date = new Date(base.getTime() + delta * 86400000);
  loadLevel(date, devMode).then(parsed => {
    startLevel(parsed, date);
    const params = new URLSearchParams();
    params.set('date', formatDate(date));
    if (devPasswordParam) params.set('dev-password', devPasswordParam);
    window.history.pushState(null, '', `/puzzle/?${params}`);
  }).catch(() => {
    if (delta < 0) hasPrevLevel = false;
    if (delta > 0) hasNextLevel = false;
    redraw();
  });
}

function hitTest(r: { x: number; y: number; w: number; h: number }, px: number, py: number) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// Extends or retracts the active chain toward the cursor: backs off if the
// cursor returns near the second-to-last tile, otherwise grabs an adjacent
// tile whose center is within reach. Assumes the chain is non-empty.
function extendChain() {
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
}

// Commits the active chain if it spells a valid word: records history, removes
// the tiles, and starts the cascade. Otherwise clears the chain. `rehover`
// picks what is hovered after a failed word — the mouse re-hovers the tile
// under the cursor; touch has no hover and passes false.
function commitChain(rehover: boolean) {
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
    hoveredTile = rehover ? tileAtPixel(tiles, cursorX, cursorY, layout) : null;
    redraw();
  }
}

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  cursorX = e.clientX - rect.left;
  cursorY = e.clientY - rect.top;
  if (leftChevronHit && hitTest(leftChevronHit, cursorX, cursorY)) { navigateByDays(-1); return; }
  if (rightChevronHit && hitTest(rightChevronHit, cursorX, cursorY)) { navigateByDays(1); return; }
  if (undoIconHit && hitTest(undoIconHit, cursorX, cursorY)) { undo(); return; }
  if (animating || levelComplete || !layout) return;
  const hit = tileAtPixel(tiles, cursorX, cursorY, layout);
  if (hit) {
    chain = [hit];
    hoveredTile = null;
    redraw();
  }
});

// True while any menu/end card is open (its overlay covers the board).
function anyCardOpen(): boolean {
  return isOverlayVisible(settingsOverlay) || isOverlayVisible(creditsOverlay) ||
         isOverlayVisible(howtoOverlay) || isOverlayVisible(endCardOverlay);
}

window.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  cursorX = e.clientX - rect.left;
  cursorY = e.clientY - rect.top;
  const overChevron = (leftChevronHit && hitTest(leftChevronHit, cursorX, cursorY)) ||
                      (rightChevronHit && hitTest(rightChevronHit, cursorX, cursorY)) ||
                      (undoIconHit && hitTest(undoIconHit, cursorX, cursorY));
  canvas.style.cursor = overChevron ? 'pointer' : '';
  if (animating || levelComplete || !layout) return;

  // Don't light up tiles under a card; it's distracting while using the menu.
  if (anyCardOpen()) {
    if (hoveredTile) { hoveredTile = null; redraw(); }
    return;
  }

  if (chain.length === 0) {
    const hit = tileAtPixel(tiles, cursorX, cursorY, layout);
    if (hit !== hoveredTile) { hoveredTile = hit; redraw(); }
    return;
  }

  extendChain();
  redraw();
});

canvas.addEventListener('mouseleave', () => {
  if (chain.length === 0 && hoveredTile) { hoveredTile = null; redraw(); }
});


window.addEventListener('mouseup', () => commitChain(true));

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
  if (undoIconHit && hitTest(undoIconHit, cursorX, cursorY)) { undo(); return; }
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

  extendChain();
  redraw();
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  commitChain(false);
}, { passive: false });

// --- animation ---

interface FallingTile {
  tile: Tile;
  pixelY: number;
  velocityY: number;
  targetPixelY: number;
  settled: boolean;
}

// Marks the level finished: reveals the end card after a beat and fires the
// celebratory full-screen splash from the cursor.
function completeLevel() {
  levelComplete = true;
  // Persist the clear as soon as the level is finished, not when the end card
  // shows, so navigating away during the reveal delay still records it.
  // Experimental levels are playtesting-only: never persist completion data.
  if (currentLevelDate && !isExperimental) {
    const record = getLevelRecord(currentLevelDate);
    const slug = formatDate(new Date());
    const updates: Partial<LevelRecord> = {};
    if (!record.cleared) updates.cleared = slug;
    if (hardMode && !record.clearedHard) updates.clearedHard = slug;
    if (Object.keys(updates).length > 0) updateLevelRecord(currentLevelDate, updates);
  }
  inputShield.style.display = 'block';
  endCardTimer = setTimeout(showEndCard, 2000);
  addSplash(cursorX, cursorY, 1200, Math.hypot(canvasW, canvasH));
}

function runFallAnimation(fallingTiles: FallingTile[], onSettled?: () => void) {
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
      if (tiles.length === 0) completeLevel();
      runSplashLoop();
      onSettled?.();
    } else {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

// One-shot hook fired when the next entry drop finishes settling. init uses
// it to pop the first-visit tutorial only once the tiles have landed.
let onNextDropSettled: (() => void) | null = null;

function startDropAnimation() {
  const onSettled = onNextDropSettled ?? undefined;
  onNextDropSettled = null;
  runFallAnimation(tiles.map(tile => {
    const targetPixelY = tilePixelY(tile, layout);
    const fallDistance = layout.offsetY + layout.maxY * (TILE_SIZE + GAP) + TILE_SIZE
      + (tile.x - layout.minX + 1) * COLUMN_STAGGER + FALL_ENTRY_EXTRA + tile.y * PITCH * 0.5;
    return { tile, pixelY: targetPixelY - fallDistance, velocityY: 0, targetPixelY, settled: false };
  }), onSettled);
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
    if (tiles.length === 0) completeLevel();
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
  // Nudge every level up by a fixed amount, then back down by a fraction of its
  // pitch, tuned so a level at PRESERVED_PITCH keeps its original position while
  // smaller (smaller-pitch) levels settle a little higher.
  const VERTICAL_UP_VH = 2;
  const PRESERVED_PITCH = 106.8;
  const upPx = VERTICAL_UP_VH / 100 * viewH;
  const offsetY = regionTop + (regionH - contentH) / 2 + PITCH * 0.85 - upPx + upPx * (PITCH / PRESERVED_PITCH);
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
  const tagMaxPx = rem;
  const tagText = 'HARD MODE COMPLETE';
  ctx.font = 'bold 100px sans-serif';
  const tagWidth = ctx.measureText(tagText).width + tagText.length * 0.08 * 100;
  const tagFitPx = 100 * contentWidth * 0.80 / tagWidth;
  hardModeTag.style.fontSize = `${Math.min(tagMaxPx, tagFitPx)}px`;
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
  loadLevel(date, devMode).then(parsed => startLevel(parsed, date));
});

// --- init ---

const dateParam = new URLSearchParams(window.location.search).get('date');

// LEGACY SUPPORT: share links generated before 2026-07-09 pointed at the root
// (/?date=...), and such links live forever in old Discord messages, BlueSky
// posts, etc. — so ?date= must keep working on the root page, not just under
// /puzzle/. Today that support is automatic (both paths serve the same HTML,
// and date handling is path-agnostic), but if that architecture ever changes,
// root ?date= links must still load — or at least redirect to — the right
// level. Here we rewrite such URLs to the current /puzzle/ format so the
// address bar matches what we'd share today. (Cosmetic: link crawlers fetch
// the root page regardless, and the bare root without a date stays put —
// it's the homepage.)
if (dateParam !== null && window.location.pathname !== '/puzzle/') {
  window.history.replaceState(null, '', `/puzzle/${window.location.search}`);
}

// Conversely, a dateless /puzzle/ URL has no reason to exist — it's just the
// homepage under the wrong path. Send it home (preserving any other params,
// e.g. dev-password). Matching /puzzle without the trailing slash too costs
// nothing, though in production GitHub Pages already redirects it to /puzzle/.
if (dateParam === null && /^\/puzzle\/?$/.test(window.location.pathname)) {
  window.history.replaceState(null, '', `/${window.location.search}`);
}

const today = new Date();
const effectiveToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);

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

// Days that borrow another day's seeded color instead of using their own.
// Maps the special day to the date whose color it wears.
function borrowedColorDate(date: Date): Date | null {
  if (date.getFullYear() !== 2026 || date.getMonth() !== 6) return null;
  // Jul 8 borrows May 26; Jul 9 borrows May 16 (both hand-picked colors).
  if (date.getDate() === 8) return new Date(2026, 4, 26);
  if (date.getDate() === 9) return new Date(2026, 4, 16);
  return null;
}

let dateStr = '';
let isExperimental = false;

function drawDateLabel() {
  if (!dateStr) return;
  const palette = currentPalette();
  const fontSize = Math.min(3 * canvasH / 100, 5 * canvasW / 100);
  const centerY = canvasH * 0.925;
  ctx.save();
  const label = isExperimental ? 'EXPERIMENTAL LEVEL' : dateStr;
  ctx.font = `${isExperimental ? 'bold ' : ''}${fontSize}px sans-serif`;
  ctx.fillStyle = isExperimental ? palette.experimental : palette.dateLabel;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const dateOffset = clearedOnStr ? fontSize * 1.136025 / 2 : 0;
  const dateY = centerY - dateOffset;
  ctx.fillText(label, canvasW / 2, dateY);
  const textW = ctx.measureText(label).width;

  if (clearedOnStr) {
    ctx.font = `${fontSize * 0.675}px sans-serif`;
    ctx.fillStyle = palette.subLabel;
    ctx.fillText(clearedOnStr, canvasW / 2, dateY + fontSize * 1.136025);
  }
  const h = fontSize * 0.55;
  const w = fontSize * 0.30;
  const gap = fontSize * 1.21;
  ctx.strokeStyle = palette.chevron;
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

function startLevel(parsed: ParsedLevel, date: Date, forceHardMode?: boolean) {
  currentParsedLevel = parsed;
  currentLevelDate = date;
  hardMode = forceHardMode ?? hardModeCheckbox.checked;
  const { tiles: loadedTiles, numCols, numRows } = parsed;
  isExperimental = parsed.experimental ?? false;
  const month = date.toLocaleString('en-US', { month: 'short' });
  dateStr = `Perplexions — ${date.getFullYear()} ${month} ${date.getDate()}`;
  levelNumCols = numCols;
  levelNumRows = numRows;
  tiles = applyGravity(loadedTiles);
  levelTiles = tiles;
  // One-offs: some 2026 days wear another day's seeded color (see borrowedColorDate).
  const borrowed = borrowedColorDate(date);
  color = randomLevelColor(dateSeed(borrowed ?? date));
  history = [];
  wordHistory = [];
  const record = getLevelRecord(date);
  updateShowEmojiHash(record);
  clearedOnStr = clearedOnLabelFor(record);
  chain = [];
  hoveredTile = null;
  levelComplete = false;
  hideEndCard();
  splashes = [];
  animating = false;

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
  const palette = currentPalette();
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = palette.errorText;
  ctx.font = '1.5rem sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, canvasW / 2, canvasH / 2);
}

async function init() {
  if (SPLASH_DEMO) { runSplashDemo(); return; }
  devMode = await devPasswordPromise;
  const wordsPromise = loadWords();
  const todayNoon = effectiveToday;
  let date = todayNoon;
  let parsed: ParsedLevel | null = null;
  let dateParamFailed = false;

  if (dateParam) {
    const requested = new Date(`${dateParam}T12:00:00`);
    try {
      parsed = await loadLevel(requested, devMode);
      date = requested;
    } catch {
      dateParamFailed = true;
      // Send failed date-param arrivals home to the canonical root, not the
      // /puzzle/ path the rewrite above may have put in the address bar.
      window.history.replaceState(null, '', '/');
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
            window.history.replaceState(null, '', `/puzzle/?${p}`);
            showToast(dateParamFailed
              ? "Couldn't load requested level or today's level — loaded latest published level instead"
              : "Couldn't load today's level — loaded latest published level instead");
          } catch { /* fall through to error */ }
        }
      }

      if (!parsed) {
        words = await wordsPromise;
        showCanvasError("Couldn't load today's puzzle.");
        // Still tutorial-worthy: a first-timer may land here via a share link
        // to a level not yet published in their time zone.
        maybeShowFirstVisitHowto();
        return;
      }
    }
  }

  words = await wordsPromise;
  // The extra beat lets the landed board register before the card covers it.
  onNextDropSettled = () => setTimeout(maybeShowFirstVisitHowto, 750);
  startLevel(parsed, date);
}

init();

