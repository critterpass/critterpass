import { describe, expect, it } from '@jest/globals';

import type { SpawnPoiRow, SpawnSqlRow } from '../../data/spawn-rows';
import { spawnCandidates, type FeedInput } from '../spawn-feed';

const POI: SpawnPoiRow = {
  id: 'poi-pools',
  name: 'Tirta Empul',
  lat: -8.4153,
  lng: 115.3153,
  visit_radius_m: null,
};

function rule(id: string, overrides: Partial<SpawnSqlRow> = {}): SpawnSqlRow {
  return {
    id,
    key: id,
    form_id: `form-${id}`,
    kind: 'presence',
    set_id: 'set-id',
    destination_id: 'bali',
    poi_ids: JSON.stringify([POI.id]),
    geofences: '[]',
    n: null,
    dwell_s: 300,
    hold_ms: null,
    window_id: null,
    solar: null,
    min_members: null,
    foreground_only: 0,
    copy: 'At a water temple',
    critter_id: `critter-${id}`,
    rarity: 'rare',
    ...overrides,
  };
}

function input(overrides: Partial<FeedInput> = {}): FeedInput {
  return {
    rules: [rule('a'), rule('b'), rule('c')],
    pois: new Map([[POI.id, POI]]),
    windows: new Map(),
    setCountry: new Map([
      ['set-id', 'ID'],
      ['set-vn', 'VN'],
    ]),
    ownedForms: new Set(),
    ownedInSet: new Map(),
    trip: { id: 'trip', destinationId: 'bali' },
    homeCountry: 'VN',
    exploreAtHome: false,
    foreground: true,
    now: new Date('2026-10-03T02:00:00Z'),
    tz: 'Asia/Makassar',
    ...overrides,
  };
}

describe('spawn feed', () => {
  it('shows the crew one local per spot per day, the same on every phone', () => {
    const first = spawnCandidates(input());
    const again = spawnCandidates(input({ rules: [rule('c'), rule('a'), rule('b')] }));
    expect(first).toHaveLength(1);
    expect(again[0]?.rule.id).toBe(first[0]?.rule.id);
    expect(first[0]).toMatchObject({ tripId: 'trip', spot: { poiId: POI.id } });
  });

  it('never offers a form already found', () => {
    const found = new Set(['form-a', 'form-b', 'form-c']);
    expect(spawnCandidates(input({ ownedForms: found }))).toEqual([]);
  });

  it('keeps the home set closed until Explore at home is on, and only in front', () => {
    const home = input({
      trip: null,
      rules: [rule('h', { set_id: 'set-vn', destination_id: 'hoi-an' })],
    });
    expect(spawnCandidates(home)).toEqual([]);
    expect(spawnCandidates({ ...home, exploreAtHome: true })[0]?.tripId).toBeNull();
    expect(spawnCandidates({ ...home, exploreAtHome: true, foreground: false })).toEqual([]);
  });

  it('counts a trip in the home country as a trip', () => {
    const danang = input({
      trip: { id: 'trip-dad', destinationId: 'da-nang' },
      rules: [rule('d', { set_id: 'set-vn', destination_id: 'da-nang' })],
    });
    expect(spawnCandidates(danang)[0]?.tripId).toBe('trip-dad');
  });

  it('closes a legendary outside its window and a solar spawn in daylight', () => {
    const windows = new Map([
      ['w', { type: 'annual_range' as const, start: '04-02', end: '04-09' }],
    ]);
    expect(spawnCandidates(input({ rules: [rule('l', { window_id: 'w' })], windows }))).toEqual([]);
    expect(spawnCandidates(input({ rules: [rule('s', { solar: 'after_dark' })] }))).toEqual([]);
  });
});
