// Everything that determines how the end-of-level color burst behaves lives
// in this file: how long it lasts, how far it can reach, and how its radius
// and opacity evolve over its life. The two curves take the splash's progress
// p = elapsed / duration, which runs 0 → 1.

// Stretching the duration slows the whole animation uniformly without
// changing its shape, since both curves are functions of p.
export const SPLASH_DURATION_MS = 2400;

// The burst fires from the cursor; the canvas diagonal is the largest radius
// ever needed to cover the whole canvas from any point in it.
export function splashMaxRadius(canvasW: number, canvasH: number): number {
  return Math.hypot(canvasW, canvasH);
}

// Ease-out-expo expansion: most of the growth lands early in the splash's
// life, which reads as a shockwave rather than a steady wipe.
export function splashRadius(p: number, maxRadius: number): number {
  return maxRadius * (1 - 2 ** (-p * 3));
}

export function splashAlpha(p: number): number {
  return (1 - p) * 0.5
}
