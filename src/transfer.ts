// Cross-origin localStorage transfer for the fire.casa/perplexions -> perplexions.io
// migration. localStorage is origin-scoped, so a player's progress does not
// follow them across the domain change. The old-origin redirect page packages
// its localStorage into a `transfer` URL param (see redirect/index.html, which
// carries a hand-ported copy of `encodeTransfer`); this module is the canonical
// definition of that format and does the unpacking + merging on the new origin.
//
// If you change the format here, update redirect/index.html to match. The
// round-trip test in transfer.test.ts guards this (canonical) side.

// localStorage key shapes (the entire universe of what the game stores):
//   `perplexions-<levelDate>`         -> JSON { cleared?, clearedHard? }
//   `perplexions-setting-<key>`       -> 'true' | 'false'
export const STORAGE_PREFIX = 'perplexions-';
export const SETTINGS_PREFIX = 'perplexions-setting-';

// The only settings that exist. Order is stable so encoding is deterministic.
export const SETTING_KEYS = ['show-hash', 'show-hash-first', 'hard-mode', 'dark-mode'] as const;

const FORMAT_VERSION = '1';
const DAY_MS = 86_400_000;
const SLUG_RE = /^\d{4}-\d{2}-\d{2}$/;

interface LevelRecord {
  cleared?: string;
  clearedHard?: string;
}

// --- date helpers (UTC to avoid DST off-by-ones) ---

function slugToMs(slug: string): number {
  const [y, m, d] = slug.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function msToSlug(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

const compact = (slug: string) => slug.replace(/-/g, '');            // 2026-06-30 -> 20260630
const uncompact = (c: string) => `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}`;

// A level key is any perplexions- key that is not a setting key and whose
// remainder is a date slug.
function levelSlugFromKey(key: string): string | null {
  if (!key.startsWith(STORAGE_PREFIX) || key.startsWith(SETTINGS_PREFIX)) return null;
  const slug = key.slice(STORAGE_PREFIX.length);
  return SLUG_RE.test(slug) ? slug : null;
}

// --- encode ---

// `entries` is the subset of localStorage worth transferring: every perplexions-
// key mapped to its raw string value. Returns the raw payload string (the caller
// URL-encodes it). Pure, so the round-trip test can exercise it directly.
export function encodeTransfer(entries: Record<string, string>): string {
  // Collect level records keyed by slug.
  const bySlug = new Map<string, LevelRecord>();
  for (const [key, raw] of Object.entries(entries)) {
    const slug = levelSlugFromKey(key);
    if (!slug) continue;
    let rec: LevelRecord;
    try { rec = JSON.parse(raw); } catch { continue; }
    if (rec && (rec.cleared || rec.clearedHard)) bySlug.set(slug, rec);
  }

  let base = '';
  let levels = '';
  if (bySlug.size > 0) {
    const slugs = [...bySlug.keys()];
    const minMs = Math.min(...slugs.map(slugToMs));
    const maxMs = Math.max(...slugs.map(slugToMs));
    base = compact(msToSlug(minMs));
    const entriesOut: string[] = [];
    for (let ms = minMs; ms <= maxMs; ms += DAY_MS) {
      const rec = bySlug.get(msToSlug(ms));
      const c = rec?.cleared ? compact(rec.cleared) : 'X';
      const h = rec?.clearedHard ? compact(rec.clearedHard) : 'X';
      entriesOut.push(`${c},${h}`);
    }
    // Trailing empty positions carry no information; drop them.
    while (entriesOut.length > 0 && entriesOut[entriesOut.length - 1] === 'X,X') entriesOut.pop();
    levels = entriesOut.join('/');
  }

  const settings: string[] = [];
  for (const key of SETTING_KEYS) {
    const val = entries[SETTINGS_PREFIX + key];
    if (val === undefined) continue;
    settings.push(`${key}:${val === 'true' ? 1 : 0}`);
  }

  return `${FORMAT_VERSION}~${base}~${levels}~${settings.join(',')}`;
}

// --- decode ---

// Inverse of encodeTransfer: reconstructs the localStorage entries (full keys ->
// values) described by the payload. Returns {} for anything it can't parse, so a
// malformed URL is a no-op rather than a crash.
export function decodeTransfer(payload: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const parts = payload.split('~');
  if (parts[0] !== FORMAT_VERSION) return entries;
  const [, base, levels, settings] = parts;

  if (base && levels) {
    const baseMs = slugToMs(uncompact(base));
    levels.split('/').forEach((entry, i) => {
      const [c, h] = entry.split(',');
      const rec: LevelRecord = {};
      if (c && c !== 'X') rec.cleared = uncompact(c);
      if (h && h !== 'X') rec.clearedHard = uncompact(h);
      if (rec.cleared || rec.clearedHard) {
        entries[STORAGE_PREFIX + msToSlug(baseMs + i * DAY_MS)] = JSON.stringify(rec);
      }
    });
  }

  if (settings) {
    const allowed = new Set<string>(SETTING_KEYS);
    for (const pair of settings.split(',')) {
      const [key, v] = pair.split(':');
      if (!allowed.has(key)) continue;
      entries[SETTINGS_PREFIX + key] = v === '1' ? 'true' : 'false';
    }
  }

  return entries;
}

// --- merge ---

// Merge one incoming level record against the destination's existing raw value.
// Returns the JSON to write, or null to leave the destination untouched. For
// each field independently: if only one side has it, take it; if both, keep the
// earlier date (YYYY-MM-DD sorts lexically == chronologically).
export function mergeLevelRecord(existingRaw: string | null, incomingRaw: string): string | null {
  if (existingRaw === null) return incomingRaw;
  let existing: LevelRecord;
  let incoming: LevelRecord;
  try {
    existing = JSON.parse(existingRaw);
    incoming = JSON.parse(incomingRaw);
  } catch {
    return null;
  }
  const merged: LevelRecord = { ...existing };
  for (const field of ['cleared', 'clearedHard'] as const) {
    const a = existing[field];
    const b = incoming[field];
    if (a && b) merged[field] = a < b ? a : b;
    else merged[field] = a ?? b;
  }
  const out = JSON.stringify(merged);
  return out === JSON.stringify(existing) ? null : out;
}

// --- browser entry point ---

// Called first thing in init(). If the URL carries a `transfer` param, merge its
// contents into localStorage, then strip the param (keeping other params like
// `date`). Wrapped so a bad payload can never block app load.
export function importTransfer(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const payload = params.get('transfer');
    if (payload === null) return;

    const incoming = decodeTransfer(payload);
    for (const [key, value] of Object.entries(incoming)) {
      if (key.startsWith(SETTINGS_PREFIX)) {
        // Destination wins: only import a setting the destination lacks.
        if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      } else {
        const merged = mergeLevelRecord(localStorage.getItem(key), value);
        if (merged !== null) localStorage.setItem(key, merged);
      }
    }

    params.delete('transfer');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
  } catch {
    // Never let a migration hiccup stop the game from loading.
  }
}
