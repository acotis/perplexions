import { render } from './render';
import type { GridLayout, Color } from './render';
import type { Tile } from './level';
import { parseLevel, applyGravity } from './level';

const LEVEL_TEXT = ' ord\n sle\n bcd\nwmars';

// Coordinates are [col, row] with col 0..4 (A..E) and row 0 (bottom) .. 3 (top).
type Coord = [number, number];

// A trace is a starting tile plus a sequence of segments. Each segment sweeps the
// cursor to `to` over `span` hop-durations (eased as one continuous motion) and
// selects tiles at the given progress fractions — letting a single smooth hop pass
// through (and select) intermediate tiles.
interface Seg { to: Coord; span: number; selects: { at: number; coord: Coord }[]; }
interface Trace { start: Coord; segs: Seg[]; }

// "scrambled": B3 s, [C2 c, D1 r] in one sweep, C1 a, B1 m, B2 b, C3 l, D3 e, D2 d.
const WORD1: Trace = {
  start: [1, 2],
  segs: [
    { to: [3, 0], span: 2, selects: [{ at: 0.5, coord: [2, 1] }, { at: 1, coord: [3, 0] }] },
    { to: [1, 0], span: 2, selects: [{ at: 0.5, coord: [2, 0] }, { at: 1, coord: [1, 0] }] },
    { to: [1, 1], span: 1, selects: [{ at: 1, coord: [1, 1] }] },
    { to: [2, 2], span: 1, selects: [{ at: 1, coord: [2, 2] }] },
    { to: [3, 2], span: 1, selects: [{ at: 1, coord: [3, 2] }] },
    { to: [3, 1], span: 1, selects: [{ at: 1, coord: [3, 1] }] },
  ],
};
// "words" along the bottom row after the cascade — one continuous stroke.
const WORD2: Trace = {
  start: [0, 0],
  segs: [
    {
      to: [4, 0],
      span: 4,
      selects: [
        { at: 0.25, coord: [1, 0] },
        { at: 0.5, coord: [2, 0] },
        { at: 0.75, coord: [3, 0] },
        { at: 1, coord: [4, 0] },
      ],
    },
  ],
};

const COLOR: Color = { r: 150, g: 200, b: 240 };

const CANVAS_W = 260;
const CANVAS_H = 240;

const HOP_MS = 285;
const STROKE_PAUSE = 200;
const PRE_TRACE_PAUSE = 550;
const POST_TRACE_HOLD = 420;
const BETWEEN_PAUSE = 420;
const EMPTY_BEAT = 2000;

interface FallingTile { tile: Tile; pixelY: number; velocityY: number; targetPixelY: number; settled: boolean; }

type Phase = 'empty' | 'fall-in' | 'pre-trace' | 'trace1' | 'cascade1' | 'between' | 'trace2';

export function setupHowtoTutorial(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;

  // Tutorial-local scale (independent of the main game's global scale).
  const pitch = Math.round((CANVAS_W * 0.84) / (4 + 10 / 11));
  const tile = pitch * 10 / 11;
  const gridW = 4 * pitch + tile;
  const offsetX = (CANVAS_W - gridW) / 2;
  const offsetY = 22;
  const layout: GridLayout = {
    offsetX, offsetY, minX: 0, maxX: 4, maxY: 3, numCols: 5,
    pitch, tileSize: tile, gap: pitch - tile,
  };

  const GRAVITY = (3000 / 64) * tile;
  const COLUMN_STAGGER = tile * 3;
  const FALL_ENTRY_EXTRA = tile * 6;

  const topY = (t: Tile) => offsetY + (layout.maxY - t.y) * pitch;
  const centerOfCoord = (c: Coord) => ({ x: offsetX + c[0] * pitch + tile / 2, y: offsetY + (layout.maxY - c[1]) * pitch + tile / 2 });
  const find = (ts: Tile[], x: number, y: number) => ts.find(t => t.x === x && t.y === y)!;
  const tilesFor = (coords: Coord[]) => coords.map(c => find(tiles, c[0], c[1]));

  let tiles: Tile[] = [];
  let chain: Tile[] = [];
  let cursor = { x: 0, y: 0 };
  let falling: FallingTile[] | null = null;
  let activeTrace: Trace = WORD1;
  let showPointer = false;

  let phase: Phase = 'empty';
  let phaseStart = 0;
  let last = 0;
  let rafId: number | null = null;

  function setPhase(p: Phase, now: number) {
    phase = p;
    phaseStart = now;
  }

  function enterEmpty(now: number) {
    tiles = [];
    chain = [];
    showPointer = false;
    falling = null;
    setPhase('empty', now);
  }

  function beginFallIn(now: number) {
    tiles = parseLevel(LEVEL_TEXT).tiles;
    chain = [];
    showPointer = false;
    falling = tiles.map(t => {
      const targetPixelY = topY(t);
      const fallDistance = offsetY + layout.maxY * pitch + tile
        + (t.x + 1) * COLUMN_STAGGER + FALL_ENTRY_EXTRA + t.y * pitch * 0.5;
      return { tile: t, pixelY: targetPixelY - fallDistance, velocityY: 0, targetPixelY, settled: false };
    });
    setPhase('fall-in', now);
  }

  function startCascade(now: number) {
    const pre = tiles;
    const next = applyGravity(pre);
    tiles = next;
    falling = pre.map((oldTile, i) => {
      const startY = topY(oldTile);
      const targetPixelY = topY(next[i]);
      return { tile: next[i], pixelY: startY, velocityY: 0, targetPixelY, settled: startY === targetPixelY };
    });
    setPhase('cascade1', now);
  }

  function stepFalling(dt: number) {
    let allSettled = true;
    for (const ft of falling!) {
      if (ft.settled) continue;
      ft.velocityY += GRAVITY * dt;
      ft.pixelY += ft.velocityY * dt;
      if (ft.pixelY >= ft.targetPixelY) { ft.pixelY = ft.targetPixelY; ft.velocityY = 0; ft.settled = true; }
      else allSettled = false;
    }
    return allSettled;
  }

  function beginTrace(trace: Trace, now: number, p: Phase) {
    activeTrace = trace;
    chain = [find(tiles, trace.start[0], trace.start[1])];
    showPointer = true;
    cursor = centerOfCoord(trace.start);
    setPhase(p, now);
  }

  function ease(t: number) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function updateTrace(now: number): 'done' | 'running' {
    const tr = activeTrace;
    const moveTotal = tr.segs.reduce((sum, seg) => sum + seg.span, 0) * HOP_MS;
    const total = moveTotal + (tr.segs.length - 1) * STROKE_PAUSE;
    const elapsed = now - phaseStart;

    if (elapsed >= total) {
      chain = tilesFor([tr.start, ...tr.segs.flatMap(seg => seg.selects.map(s => s.coord))]);
      cursor = centerOfCoord(tr.segs[tr.segs.length - 1].to);
      return elapsed >= total + POST_TRACE_HOLD ? 'done' : 'running';
    }

    const coords: Coord[] = [tr.start];
    let t = elapsed;
    let prev = tr.start;
    for (let i = 0; i < tr.segs.length; i++) {
      const seg = tr.segs[i];
      const moveDur = seg.span * HOP_MS;
      if (t < moveDur) {
        const frac = ease(t / moveDur);
        const a = centerOfCoord(prev);
        const b = centerOfCoord(seg.to);
        cursor = { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
        for (const sel of seg.selects) if (sel.at <= frac) coords.push(sel.coord);
        chain = tilesFor(coords);
        return 'running';
      }
      t -= moveDur;
      for (const sel of seg.selects) coords.push(sel.coord);
      prev = seg.to;
      if (i < tr.segs.length - 1) {
        if (t < STROKE_PAUSE) {
          cursor = centerOfCoord(seg.to);
          chain = tilesFor(coords);
          return 'running';
        }
        t -= STROKE_PAUSE;
      }
    }
    chain = tilesFor(coords);
    return 'running';
  }

  function removeChain() {
    const set = new Set(chain);
    tiles = tiles.filter(t => !set.has(t));
    chain = [];
    showPointer = false;
  }

  function drawPointer() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cursor.x, cursor.y, tile * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,40,40,0.28)';
    ctx.fill();
    ctx.lineWidth = Math.max(1, tile * 0.05);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    const fy = falling ? new Map(falling.map(f => [f.tile, f.pixelY])) : null;
    render(ctx, tiles, layout, COLOR, {
      chain,
      cursorX: cursor.x,
      cursorY: cursor.y,
      getTilePixelY: fy ? (t => fy.get(t) ?? topY(t)) : undefined,
    });
    if (showPointer) drawPointer();
  }

  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    switch (phase) {
      case 'empty':
        if (now - phaseStart >= EMPTY_BEAT) beginFallIn(now);
        break;
      case 'fall-in':
        if (stepFalling(dt)) { falling = null; setPhase('pre-trace', now); }
        break;
      case 'pre-trace':
        if (now - phaseStart >= PRE_TRACE_PAUSE) beginTrace(WORD1, now, 'trace1');
        break;
      case 'trace1':
        if (updateTrace(now) === 'done') { removeChain(); startCascade(now); }
        break;
      case 'cascade1':
        if (stepFalling(dt)) { falling = null; setPhase('between', now); }
        break;
      case 'between':
        if (now - phaseStart >= BETWEEN_PAUSE) beginTrace(WORD2, now, 'trace2');
        break;
      case 'trace2':
        if (updateTrace(now) === 'done') { removeChain(); enterEmpty(now); }
        break;
    }

    draw();
    rafId = requestAnimationFrame(frame);
  }

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${CANVAS_W}px`;
    canvas.width = Math.round(CANVAS_W * dpr);
    canvas.height = Math.round(CANVAS_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function start() {
    stop();
    sizeCanvas();
    const now = performance.now();
    last = now;
    enterEmpty(now);
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { start, stop };
}
