import { describe, expect, it } from 'vitest';

import {
  normaliseName,
  pickDivisionPoints,
  type DivisionCandidate,
} from '../../src/places/division-points';
import { boxAround, boxSideKm } from '../../src/places/place-bounds';

describe('boxSideKm', () => {
  it('runs from 8 km for towns to 30 km for metros, and 12 km when population is unknown', () => {
    expect(boxSideKm(12_000)).toBe(8);
    expect(boxSideKm(30_000)).toBe(8);
    expect(boxSideKm(9_000_000)).toBe(30);
    expect(boxSideKm(null)).toBe(12);
    const midsize = boxSideKm(400_000);
    expect(midsize).toBeGreaterThan(8);
    expect(midsize).toBeLessThan(30);
  });
});

describe('boxAround', () => {
  it('spans the side in both directions, widening longitude with latitude', () => {
    const box = boxAround(60, 10, 22.264);
    expect(box.maxLat - box.minLat).toBeCloseTo(0.2, 3);
    expect(box.maxLng - box.minLng).toBeCloseTo(0.4, 3);
    expect((box.minLat + box.maxLat) / 2).toBeCloseTo(60, 4);
  });
});

describe('pickDivisionPoints', () => {
  const candidate = (changes: Partial<DivisionCandidate>): DivisionCandidate => ({
    country: 'VN',
    subtype: 'locality',
    population: null,
    names: [],
    lat: 0,
    lng: 0,
    ...changes,
  });

  it('matches accent- and case-insensitively within the country, a locality before a region', () => {
    const picked = pickDivisionPoints(
      [
        { key: 'vn-hoi-an', name: 'Hội An', country: 'VN' },
        { key: 'vn-hue', name: 'Huế', country: 'VN' },
      ],
      [
        candidate({ names: ['Hoi An'], subtype: 'county', population: 120_000, lat: 1 }),
        candidate({ names: ['Thành phố Hội An', 'Hội An'], population: 98_000, lat: 2 }),
        candidate({ names: ['Hội An'], country: 'LA', lat: 3 }),
      ],
    );
    expect(picked.get('vn-hoi-an')).toMatchObject({ lat: 2, subtype: 'locality' });
    expect(picked.has('vn-hue')).toBe(false);
  });

  it('prefers the larger population between equal subtypes', () => {
    const picked = pickDivisionPoints(
      [{ key: 'gb-london', name: 'London', country: 'GB' }],
      [
        candidate({ country: 'GB', names: ['London'], population: 2_000, lat: 1 }),
        candidate({ country: 'GB', names: ['London'], population: 8_900_000, lat: 2 }),
      ],
    );
    expect(picked.get('gb-london')?.lat).toBe(2);
  });

  it('folds đ like the database side does', () => {
    expect(normaliseName('Đà Nẵng')).toBe('da nang');
  });
});
