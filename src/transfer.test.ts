import { describe, it, expect, afterEach } from 'vitest';
import {
  encodeTransfer,
  decodeTransfer,
  mergeLevelRecord,
  importTransfer,
  STORAGE_PREFIX,
  SETTINGS_PREFIX,
} from './transfer';

const lvl = (slug: string) => STORAGE_PREFIX + slug;
const set = (key: string) => SETTINGS_PREFIX + key;

describe('encode/decode round-trip', () => {
  it('reproduces level records and settings', () => {
    const entries = {
      [lvl('2026-06-30')]: JSON.stringify({ cleared: '2026-06-30' }),
      [lvl('2026-07-01')]: JSON.stringify({ cleared: '2026-07-01', clearedHard: '2026-07-02' }),
      [lvl('2026-07-03')]: JSON.stringify({ clearedHard: '2026-07-05' }),
      [set('dark-mode')]: 'false',
      [set('show-hash')]: 'true',
    };
    expect(decodeTransfer(encodeTransfer(entries))).toEqual(entries);
  });

  it('handles a gap between records (emits X,X for the missing day)', () => {
    const entries = {
      [lvl('2026-06-18')]: JSON.stringify({ cleared: '2026-06-18' }),
      [lvl('2026-06-20')]: JSON.stringify({ cleared: '2026-06-20' }),
    };
    const payload = encodeTransfer(entries);
    // base + three positions: 18 (present), 19 (gap), 20 (present).
    expect(payload).toBe('1~20260618~20260618,X/X,X/20260620,X~');
    expect(decodeTransfer(payload)).toEqual(entries);
  });

  it('trims trailing empty positions but keeps interior gaps', () => {
    // Only settings, no levels.
    const entries = { [set('hard-mode')]: 'true' };
    const payload = encodeTransfer(entries);
    expect(payload).toBe('1~~~hard-mode:1');
    expect(decodeTransfer(payload)).toEqual(entries);
  });

  it('round-trips empty storage', () => {
    expect(decodeTransfer(encodeTransfer({}))).toEqual({});
  });

  it('ignores empty {} level records', () => {
    const entries = { [lvl('2026-07-01')]: '{}' };
    expect(decodeTransfer(encodeTransfer(entries))).toEqual({});
  });
});

describe('decodeTransfer robustness', () => {
  it('returns {} on a wrong/missing version', () => {
    expect(decodeTransfer('2~20260618~20260618,X~')).toEqual({});
    expect(decodeTransfer('garbage')).toEqual({});
  });

  it('drops unknown setting keys', () => {
    expect(decodeTransfer('1~~~evil-key:1,dark-mode:0')).toEqual({ [set('dark-mode')]: 'false' });
  });
});

describe('mergeLevelRecord', () => {
  it('takes the incoming record when the destination has none', () => {
    const incoming = JSON.stringify({ cleared: '2026-07-01' });
    expect(mergeLevelRecord(null, incoming)).toBe(incoming);
  });

  it('keeps the earlier date per field', () => {
    const existing = JSON.stringify({ cleared: '2026-07-05', clearedHard: '2026-07-05' });
    const incoming = JSON.stringify({ cleared: '2026-07-01', clearedHard: '2026-07-09' });
    const merged = JSON.parse(mergeLevelRecord(existing, incoming)!);
    expect(merged).toEqual({ cleared: '2026-07-01', clearedHard: '2026-07-05' });
  });

  it('fills a field the destination lacks from the incoming record', () => {
    const existing = JSON.stringify({ cleared: '2026-07-01' });
    const incoming = JSON.stringify({ clearedHard: '2026-07-02' });
    const merged = JSON.parse(mergeLevelRecord(existing, incoming)!);
    expect(merged).toEqual({ cleared: '2026-07-01', clearedHard: '2026-07-02' });
  });

  it('returns null when nothing changes (incoming is same or later)', () => {
    const existing = JSON.stringify({ cleared: '2026-07-01' });
    const incoming = JSON.stringify({ cleared: '2026-07-09' });
    expect(mergeLevelRecord(existing, incoming)).toBeNull();
  });
});

// End-to-end through the browser glue: fake localStorage + window, then run
// importTransfer against a URL carrying a payload built by encodeTransfer. This
// exercises the same code path a migrated player hits on perplexions.io.
describe('importTransfer', () => {
  function fakeLocalStorage(initial: Record<string, string> = {}) {
    const m = new Map(Object.entries(initial));
    return {
      get length() { return m.size; },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => { m.set(k, String(v)); },
      removeItem: (k: string) => { m.delete(k); },
      _dump: () => Object.fromEntries(m),
    };
  }

  function fakeWindow(search: string, pathname = '/', hash = '') {
    const win: any = {
      location: { pathname, search, hash },
      history: {
        replaceState(_s: unknown, _t: unknown, url: string) {
          let rest = url;
          const hi = rest.indexOf('#');
          if (hi >= 0) { win.location.hash = rest.slice(hi); rest = rest.slice(0, hi); }
          else win.location.hash = '';
          const qi = rest.indexOf('?');
          if (qi >= 0) { win.location.pathname = rest.slice(0, qi); win.location.search = rest.slice(qi); }
          else { win.location.pathname = rest; win.location.search = ''; }
        },
      },
    };
    return win;
  }

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('merges an encoded payload into localStorage and strips the param', () => {
    // What fire.casa hands over, packed the same way the redirect page does.
    const outgoing = {
      [STORAGE_PREFIX + '2026-07-01']: JSON.stringify({ cleared: '2026-07-01', clearedHard: '2026-07-01' }),
      [STORAGE_PREFIX + '2026-07-02']: JSON.stringify({ cleared: '2026-07-02' }),
      [SETTINGS_PREFIX + 'dark-mode']: 'false',
      [SETTINGS_PREFIX + 'show-hash']: 'true',
    };
    const payload = encodeTransfer(outgoing);

    // Destination already has a *later* clear for 07-01 and its own dark-mode.
    const store = fakeLocalStorage({
      [STORAGE_PREFIX + '2026-07-01']: JSON.stringify({ cleared: '2026-07-10' }),
      [SETTINGS_PREFIX + 'dark-mode']: 'true',
    });
    (globalThis as any).localStorage = store;
    (globalThis as any).window = fakeWindow(`?date=2026-07-01&transfer=${encodeURIComponent(payload)}`);

    importTransfer();

    const after = store._dump();
    // Earlier date wins on the contested field; clearedHard fills in.
    expect(JSON.parse(after[STORAGE_PREFIX + '2026-07-01'])).toEqual({ cleared: '2026-07-01', clearedHard: '2026-07-01' });
    // Brand-new record imported wholesale.
    expect(JSON.parse(after[STORAGE_PREFIX + '2026-07-02'])).toEqual({ cleared: '2026-07-02' });
    // Destination wins for a setting it already had; missing one is imported.
    expect(after[SETTINGS_PREFIX + 'dark-mode']).toBe('true');
    expect(after[SETTINGS_PREFIX + 'show-hash']).toBe('true');
    // transfer param stripped, other params kept.
    expect((globalThis as any).window.location.search).toBe('?date=2026-07-01');
  });

  it('is a no-op when there is no transfer param', () => {
    const store = fakeLocalStorage({ [STORAGE_PREFIX + '2026-07-01']: JSON.stringify({ cleared: '2026-07-01' }) });
    (globalThis as any).localStorage = store;
    (globalThis as any).window = fakeWindow('?date=2026-07-01');
    importTransfer();
    expect(store._dump()).toEqual({ [STORAGE_PREFIX + '2026-07-01']: JSON.stringify({ cleared: '2026-07-01' }) });
    expect((globalThis as any).window.location.search).toBe('?date=2026-07-01');
  });
});
