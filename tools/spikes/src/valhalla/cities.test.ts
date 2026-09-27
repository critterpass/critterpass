import { describe, expect, it } from 'vitest';

import { CITIES, citiesInGroups, createRng, samplePointInBbox, samplePointsInBbox } from './cities';

describe('CITIES', () => {
  it('has unique keys', () => {
    const keys = CITIES.map((city) => city.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only has valid bboxes (south < north, west < east)', () => {
    for (const city of CITIES) {
      expect(city.south).toBeLessThan(city.north);
      expect(city.west).toBeLessThan(city.east);
    }
  });
});

describe('citiesInGroups', () => {
  it('returns only cities in the requested groups, preserving CITIES order', () => {
    const seaJapan = citiesInGroups(['sea-japan']);
    expect(seaJapan.length).toBeGreaterThan(0);
    expect(seaJapan.every((city) => city.group === 'sea-japan')).toBe(true);

    const guide = citiesInGroups(['guide']);
    expect(guide.length).toBeGreaterThan(0);
    expect(guide.every((city) => city.group === 'guide')).toBe(true);

    expect(seaJapan.length + guide.length).toBe(CITIES.length);
  });

  it('returns an empty array for an unknown group', () => {
    expect(citiesInGroups(['antarctica'])).toEqual([]);
  });

  it('combines multiple groups', () => {
    expect(citiesInGroups(['sea-japan', 'guide'])).toHaveLength(CITIES.length);
  });
});

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces values in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('differs across seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});

describe('samplePointInBbox', () => {
  it('always stays within the bbox bounds across many draws and every city', () => {
    const rng = createRng(20260927);
    for (const city of CITIES) {
      for (let i = 0; i < 200; i += 1) {
        const point = samplePointInBbox(city, rng);
        expect(point.lat).toBeGreaterThanOrEqual(city.south);
        expect(point.lat).toBeLessThanOrEqual(city.north);
        expect(point.lon).toBeGreaterThanOrEqual(city.west);
        expect(point.lon).toBeLessThanOrEqual(city.east);
      }
    }
  });
});

describe('samplePointsInBbox', () => {
  it('returns the requested count', () => {
    const rng = createRng(1);
    const city = CITIES[0];
    if (!city) throw new Error('expected at least one city fixture');
    expect(samplePointsInBbox(city, rng, 16)).toHaveLength(16);
  });
});
