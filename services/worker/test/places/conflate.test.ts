import { describe, expect, it } from 'vitest';

import {
  categoriesCompatible,
  conflatePlaces,
  haversineDistanceM,
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
});
