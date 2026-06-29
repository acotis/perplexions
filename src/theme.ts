// Centralized theme palette for the canvas-rendered parts of the game. The
// HTML menu chrome is themed separately via CSS variables in style.css, keyed
// off the `data-theme` attribute that setDarkMode() sets on <html>.

export interface Palette {
  // Canvas background and the interior of an unselected (outline-only) tile.
  background: string;
  tileInterior: string;
  // Whether the tile interior is dark, so glyphs drawn on it pick a light color.
  interiorIsDark: boolean;
  // The soft "floor shadow" gradient drawn beneath the tiles.
  floorShadowNear: string;
  floorShadowFar: string;
  // Date/nav chrome drawn directly on the canvas.
  dateLabel: string;
  subLabel: string;
  experimental: string;
  chevron: string;
  hashLabel: string;
  errorText: string;
}

export const LIGHT_PALETTE: Palette = {
  background: '#fff',
  tileInterior: '#fff',
  interiorIsDark: false,
  floorShadowNear: 'rgba(100,100,100,0.15)',
  floorShadowFar: 'rgba(255,255,255,0)',
  dateLabel: '#666',
  subLabel: '#999',
  experimental: '#cc0000',
  chevron: '#666',
  hashLabel: '#aaa',
  errorText: '#888',
};

export const DARK_PALETTE: Palette = {
  background: '#15161a',
  tileInterior: '#15161a',
  interiorIsDark: true,
  floorShadowNear: 'rgba(0,0,0,0.35)',
  floorShadowFar: 'rgba(0,0,0,0)',
  dateLabel: '#95979e',
  subLabel: '#72747a',
  experimental: '#ff6b6b',
  chevron: '#95979e',
  hashLabel: '#86888f',
  errorText: '#95979e',
};

let darkMode = false;

export function isDark(): boolean {
  return darkMode;
}

export function currentPalette(): Palette {
  return darkMode ? DARK_PALETTE : LIGHT_PALETTE;
}

export function setDarkMode(on: boolean): void {
  darkMode = on;
  document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
}
