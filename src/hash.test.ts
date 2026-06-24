import { describe, it, expect } from 'vitest';
import { hashString } from './hash';

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('hello world')).toBe(hashString('hello world'));
  });

  // Golden values: these pin the hash output so an accidental change to the
  // algorithm (which would alter every player's shared results) fails loudly.
  it('matches known golden values', () => {
    expect(hashString('')).toBe(5381);
    expect(hashString('a')).toBe(177604);
    expect(hashString('words')).toBe(191452152);
  });

  it('returns an unsigned 32-bit integer', () => {
    for (const s of ['', 'a', 'the quick brown fox', '日本語', '2026-06-23 perplexions']) {
      const h = hashString(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('distinguishes similar strings', () => {
    expect(hashString('ab')).not.toBe(hashString('ba'));
    expect(hashString('2026-06-23 cat')).not.toBe(hashString('2026-06-24 cat'));
    expect(hashString('2026-06-23 cot')).not.toBe(hashString('2026-06-23 cat'));
  });
});
