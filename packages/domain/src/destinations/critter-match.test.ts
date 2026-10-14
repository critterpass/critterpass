import { describe, expect, it } from 'vitest';

import { matchCritter } from './critter-match';
import { CRITTER_ADMIN_OVERRIDES, CRITTER_HOMES } from './critter-regions';

const match = (countryCode: string, lat: number, lng: number, admin1: string | null = null) =>
  matchCritter({ countryCode, admin1, lat, lng }, CRITTER_HOMES, CRITTER_ADMIN_OVERRIDES);

describe('matchCritter', () => {
  it('has a home for each of the 151 critters', () => {
    expect(new Set(CRITTER_HOMES.map((home) => home.key)).size).toBe(151);
  });

  it('gives a town in a single-critter country that country’s critter', () => {
    // Arequipa is about 330 km from Cusco.
    const outcome = match('PE', -16.409, -71.537);
    expect(outcome).toMatchObject({
      kind: 'matched',
      match: { critterKey: 'cp-145', method: 'nearest' },
    });
  });

  it('sends Kalimantan to the Borneo critter by override, not to Bali', () => {
    const outcome = match('ID', -0.026, 109.342, 'West Kalimantan');
    expect(outcome).toMatchObject({
      kind: 'matched',
      match: { critterKey: 'cp-081', method: 'override' },
    });
  });

  it('matches a spot on an island to the island’s critter (Phú Quốc)', () => {
    const outcome = match('VN', 10.3, 104.0);
    expect(outcome).toMatchObject({ kind: 'matched', match: { critterKey: 'cp-009' } });
  });

  it('asks about a near tie between two critters of the same country', () => {
    // Điện Bàn lies about as far from Hội An as from Đà Nẵng.
    const outcome = match('VN', 15.967, 108.27);
    expect(outcome.kind).toBe('residual');
    if (outcome.kind !== 'residual') return;
    const keys = outcome.candidates.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['cp-005', 'cp-151']));
    expect(keys.length).toBeLessThanOrEqual(4);
  });

  it('falls back to the globally nearest critter for a country with none', () => {
    // Yangon, Myanmar.
    const outcome = match('MM', 16.84, 96.17);
    expect(outcome.kind).toBe('residual');
    if (outcome.kind !== 'residual') return;
    expect(outcome.fallback).toMatchObject({ method: 'global', critterKey: 'cp-068' });
    expect(outcome.candidates.map((c) => c.key)).toHaveLength(3);
  });
});
