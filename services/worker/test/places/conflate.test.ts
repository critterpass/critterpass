import { describe, expect, it } from 'vitest';

import {
  categoriesCompatible,
  conflatePlaces,
  haversineDistanceM,
  mergeOpenDataFields,
  trigramSimilarity,
  type ConflationCandidate,
} from '../../src/places/conflate';

describe('haversineDistanceM', () => {
  it('is zero for the same point', () => {
    expect(haversineDistanceM({ lat: 35.0, lng: 135.0 }, { lat: 35.0, lng: 135.0 })).toBe(0);
  });

  it('matches a known short distance within a few meters', () => {
    // Roughly 111 km per degree of latitude at the equator-ish; 0.001 deg ~= 111 m.
    const distance = haversineDistanceM({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 });
    expect(distance).toBeGreaterThan(105);
    expect(distance).toBeLessThan(115);
  });
});

describe('trigramSimilarity', () => {
  it('is 1 for identical strings', () => {
    expect(trigramSimilarity('Nishiki Market', 'Nishiki Market')).toBe(1);
  });

  it('is 0 for completely unrelated strings', () => {
    expect(trigramSimilarity('Nishiki Market', 'zzz qqq xxx')).toBe(0);
  });

  it('is high for a punctuation/casing variant of the same name', () => {
    expect(trigramSimilarity('Fushimi Inari Taisha', 'fushimi inari-taisha')).toBeGreaterThan(0.6);
  });

  it('is low for two different but similarly-shaped short names', () => {
    expect(trigramSimilarity('Cafe A', 'Cafe B')).toBeLessThan(0.6);
  });
});

describe('categoriesCompatible', () => {
  it('accepts equal categories', () => {
    expect(categoriesCompatible('food', 'food')).toBe(true);
  });

  it('rejects clearly different categories', () => {
    expect(categoriesCompatible('food', 'museum')).toBe(false);
  });

  it('stays permissive when either side is the unmapped fallback', () => {
    expect(categoriesCompatible('other', 'museum')).toBe(true);
    expect(categoriesCompatible('museum', 'other')).toBe(true);
  });
});

function candidate(
  overrides: Partial<ConflationCandidate> & { sourceId: string },
): ConflationCandidate {
  return {
    name: 'Place',
    categoryLabels: ['restaurant'],
    lat: 35.0,
    lng: 135.0,
    ...overrides,
  };
}

describe('conflatePlaces', () => {
  it('merges a close, similarly-named, same-category pair into one POI with both source ids', () => {
    const fsq = [
      candidate({ sourceId: 'fsq-1', name: 'Nishiki Market', lat: 35.0051, lng: 135.0051 }),
    ];
    const overture = [
      candidate({ sourceId: 'overture-1', name: 'Nishiki Market', lat: 35.0052, lng: 135.0052 }),
    ];
    const result = conflatePlaces(fsq, overture);
    expect(result).toEqual([
      expect.objectContaining({
        name: 'Nishiki Market',
        sourceIds: { fsq_os: 'fsq-1', overture: 'overture-1' },
      }),
    ]);
  });

  it('keeps two places separate when they are far apart despite an identical name', () => {
    const fsq = [candidate({ sourceId: 'fsq-1', name: 'Family Mart', lat: 35.0, lng: 135.0 })];
    const overture = [
      candidate({ sourceId: 'overture-1', name: 'Family Mart', lat: 35.05, lng: 135.05 }),
    ];
    const result = conflatePlaces(fsq, overture);
    expect(result).toHaveLength(2);
    expect(result.map((poi) => poi.sourceIds)).toEqual(
      expect.arrayContaining([{ fsq_os: 'fsq-1' }, { overture: 'overture-1' }]),
    );
  });

  it('keeps two places separate when they are close but named too differently', () => {
    const fsq = [
      candidate({ sourceId: 'fsq-1', name: 'Blue Bottle Coffee', lat: 35.0, lng: 135.0 }),
    ];
    const overture = [
      candidate({ sourceId: 'overture-1', name: 'Ramen Ichiran', lat: 35.0001, lng: 135.0001 }),
    ];
    const result = conflatePlaces(fsq, overture);
    expect(result).toHaveLength(2);
  });

  it('keeps two places separate when close and similarly named but in incompatible categories', () => {
    const fsq = [
      candidate({
        sourceId: 'fsq-1',
        name: 'Sakura',
        categoryLabels: ['restaurant'],
        lat: 35.0,
        lng: 135.0,
      }),
    ];
    const overture = [
      candidate({
        sourceId: 'overture-1',
        name: 'Sakura',
        categoryLabels: ['hindu_temple'],
        lat: 35.0001,
        lng: 135.0001,
      }),
    ];
    const result = conflatePlaces(fsq, overture);
    expect(result).toHaveLength(2);
  });

  it('picks the closer of two otherwise-equal Overture candidates for one FSQ row, leaving the other unmatched', () => {
    const fsq = [candidate({ sourceId: 'fsq-1', name: 'Nishiki Market', lat: 35.0, lng: 135.0 })];
    const overture = [
      candidate({ sourceId: 'overture-far', name: 'Nishiki Market', lat: 35.0003, lng: 135.0003 }),
      candidate({
        sourceId: 'overture-near',
        name: 'Nishiki Market',
        lat: 35.00005,
        lng: 135.00005,
      }),
    ];
    const result = conflatePlaces(fsq, overture);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceIds: { fsq_os: 'fsq-1', overture: 'overture-near' } }),
        expect.objectContaining({ sourceIds: { overture: 'overture-far' } }),
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('never double-matches one Overture row to two FSQ rows', () => {
    const fsq = [
      candidate({ sourceId: 'fsq-1', name: 'Cafe Central', lat: 35.0, lng: 135.0 }),
      candidate({ sourceId: 'fsq-2', name: 'Cafe Central', lat: 35.00001, lng: 135.00001 }),
    ];
    const overture = [
      candidate({ sourceId: 'overture-1', name: 'Cafe Central', lat: 35.0, lng: 135.0 }),
    ];
    const result = conflatePlaces(fsq, overture);
    expect(result).toHaveLength(2);
    const overtureMatches = result.filter((poi) => poi.sourceIds.overture === 'overture-1');
    expect(overtureMatches).toHaveLength(1);
  });

  it('falls back to the source label when a category never maps to the taxonomy', () => {
    const fsq = [candidate({ sourceId: 'fsq-1', categoryLabels: ['some unknown thing'] })];
    const result = conflatePlaces(fsq, []);
    expect(result).toEqual([expect.objectContaining({ category: 'other' })]);
  });

  it('matches across a spatial cell boundary', () => {
    // 0.001 degree cells: these two rows sit about 22 m apart on either side of a cell edge.
    const fsq = [candidate({ sourceId: 'fsq-1', name: 'Kiyomizu', lat: 34.9999, lng: 135.7849 })];
    const overture = [
      candidate({ sourceId: 'overture-1', name: 'Kiyomizu', lat: 35.0001, lng: 135.7851 }),
    ];
    expect(conflatePlaces(fsq, overture)).toEqual([
      expect.objectContaining({ sourceIds: { fsq_os: 'fsq-1', overture: 'overture-1' } }),
    ]);
  });

  it('matches near the edge of the distance threshold at high latitude', () => {
    // Reykjavik: 55 m due east is a much larger longitude step than at the equator.
    const lat = 64.1466;
    const lngStep = 55 / (111_320 * Math.cos((lat * Math.PI) / 180));
    const fsq = [candidate({ sourceId: 'fsq-1', name: 'Hallgrimskirkja', lat, lng: -21.9266 })];
    const overture = [
      candidate({
        sourceId: 'overture-1',
        name: 'Hallgrimskirkja',
        lat,
        lng: -21.9266 + lngStep,
      }),
    ];
    expect(conflatePlaces(fsq, overture)).toHaveLength(1);
  });

  // 40k × 40k places: an all-pairs comparison would run for minutes, so a generous budget still
  // catches that regression while staying stable on CI runners (about 3× slower than a dev Mac).
  it('conflates a metro-sized input without comparing every pair', { timeout: 60_000 }, () => {
    const rows = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) =>
        candidate({
          sourceId: `${prefix}-${i}`,
          name: `Place ${i}`,
          lat: 35 + Math.floor(i / 400) * 0.0008,
          lng: 135 + (i % 400) * 0.0008,
        }),
      );
    const started = performance.now();
    const result = conflatePlaces(rows('fsq', 40_000), rows('overture', 40_000));
    expect(result).toHaveLength(40_000);
    expect(
      result.every((poi) => poi.sourceIds.fsq_os?.slice(4) === poi.sourceIds.overture?.slice(9)),
    ).toBe(true);
    expect(performance.now() - started).toBeLessThan(30_000);
  });
});

describe('mergeOpenDataFields', () => {
  const base = { name: 'Morning Glory', categoryLabels: [], lat: 15.877, lng: 108.328 };

  it("prefers FSQ's contact details and fills each gap from Overture", () => {
    const fsq: ConflationCandidate = { ...base, sourceId: 'fsq', phone: '+84 235 1' };
    const overture: ConflationCandidate = {
      ...base,
      sourceId: 'ov',
      confidence: 0.77,
      website: 'https://morning-glory.example',
      phone: '+84 235 2',
      brand: 'Morning Glory',
    };
    expect(mergeOpenDataFields(fsq, overture)).toEqual({
      confidence: 0.77,
      website: 'https://morning-glory.example',
      phone: '+84 235 1',
      brand: 'Morning Glory',
    });
  });

  it('carries the fields through conflation for matched and unmatched rows', () => {
    const fsq: ConflationCandidate = { ...base, sourceId: 'fsq', website: 'https://fsq.example' };
    const overture: ConflationCandidate = { ...base, sourceId: 'ov', confidence: 0.6 };
    const lone: ConflationCandidate = {
      ...base,
      sourceId: 'ov-2',
      name: 'Hoi An Night Market',
      lat: 15.875,
      confidence: 0.9,
      phone: '+84 3',
    };
    const [matched, unmatched] = conflatePlaces([fsq], [overture, lone]);
    expect(matched).toMatchObject({ confidence: 0.6, website: 'https://fsq.example' });
    expect(unmatched).toMatchObject({ confidence: 0.9, phone: '+84 3' });
  });
});
