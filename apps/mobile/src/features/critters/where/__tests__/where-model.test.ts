import { describe, expect, it } from '@jest/globals';

import type { SpawnPoiRow, SpawnSqlRow } from '../../data/spawn-rows';
import { destinationSpots, formWhere, mapFraming } from '../where-model';

const DANANG = 'dest-danang';
const HOIAN = 'dest-hoian';

function rule(id: string, changes: Partial<SpawnSqlRow>): SpawnSqlRow {
  return {
    id,
    key: id,
    form_id: `form-${id}`,
    kind: 'presence',
    set_id: 'set-vn',
    destination_id: DANANG,
    poi_ids: '[]',
    geofences: '[]',
    n: null,
    dwell_s: 300,
    hold_ms: null,
    window_id: null,
    solar: null,
    min_members: null,
    foreground_only: 0,
    copy: null,
    critter_id: 'critter-langur',
    rarity: 'common',
    ...changes,
  };
}

const fence = (label: string, lat: number, lng: number, radius = 150) =>
  JSON.stringify([{ lat, lng, radius_m: radius, label }]);

const POIS = new Map<string, SpawnPoiRow>([
  [
    'poi-bridge',
    { id: 'poi-bridge', name: 'Dragon Bridge', lat: 16.0611, lng: 108.2277, visit_radius_m: null },
  ],
  [
    'poi-peak',
    { id: 'poi-peak', name: 'Bàn Cờ Peak', lat: 16.1186, lng: 108.2733, visit_radius_m: null },
  ],
  [
    'poi-pagoda',
    {
      id: 'poi-pagoda',
      name: 'Linh Ứng Pagoda',
      lat: 16.1003,
      lng: 108.2779,
      visit_radius_m: null,
    },
  ],
]);

const BRIDGE = { lat: 16.0611, lng: 108.2277 };
const base = { pois: POIS, windows: [], destinationId: DANANG, position: BRIDGE };

describe('where a form can be met', () => {
  it('lists its spots nearest first and says to stay its dwell', () => {
    const rare = rule('rare', {
      form_id: 'form-rare',
      rarity: 'rare',
      poi_ids: '["poi-peak","poi-pagoda"]',
      dwell_s: 600,
    });
    const where = formWhere({ ...base, formId: 'form-rare', rules: [rare] });
    expect(where?.rarity).toBe('rare');
    expect(where?.spots.map((s) => s.name)).toEqual(['Linh Ứng Pagoda', 'Bàn Cờ Peak']);
    expect(where?.nearest?.name).toBe('Linh Ứng Pagoda');
    expect(where?.nearest?.radiusM).toBe(50);
    expect(where?.steps).toEqual([
      { kind: 'go', places: 2 },
      { kind: 'stay', minutes: 10 },
    ]);
  });

  it('keeps the order by name without a position, and the geofence radius', () => {
    const r = rule('r', {
      geofences: fence('Son Tra', 16.1, 108.25, 400),
      poi_ids: '["poi-bridge"]',
    });
    const where = formWhere({ ...base, position: null, formId: 'form-r', rules: [r] });
    expect(where?.spots.map((s) => [s.name, s.distanceM, s.radiusM])).toEqual([
      ['Dragon Bridge', null, 50],
      ['Son Tra', null, 400],
    ]);
  });

  it('says when, with whom and after what, for the harder forms', () => {
    const epic = rule('epic', {
      form_id: 'form-epic',
      rarity: 'epic',
      kind: 'set_count',
      n: 3,
      solar: 'by_sunrise',
      poi_ids: '["poi-peak"]',
    });
    expect(formWhere({ ...base, formId: 'form-epic', rules: [epic] })?.steps).toEqual([
      { kind: 'set_first', n: 3 },
      { kind: 'go', places: 1 },
      { kind: 'solar', when: 'by_sunrise' },
      { kind: 'stay', minutes: 5 },
    ]);
    const legendary = rule('leg', {
      form_id: 'form-leg',
      rarity: 'legendary',
      kind: 'co_presence',
      min_members: 4,
      window_id: 'win-1',
      dwell_s: 0,
      poi_ids: '["poi-peak"]',
    });
    const windows = [
      { id: 'win-1', place_line: 'Sơn Trà, Lunar New Year', challenge: 'All four at the top' },
    ];
    expect(formWhere({ ...base, windows, formId: 'form-leg', rules: [legendary] })?.steps).toEqual([
      { kind: 'go', places: 1 },
      { kind: 'day', placeLine: 'Sơn Trà, Lunar New Year', challenge: 'All four at the top' },
      { kind: 'together', members: 4 },
    ]);
    const tour = rule('tour', {
      form_id: 'form-tour',
      kind: 'any_of',
      n: 2,
      poi_ids: '["poi-peak","poi-pagoda","poi-bridge"]',
    });
    expect(formWhere({ ...base, formId: 'form-tour', rules: [tour] })?.steps[0]).toEqual({
      kind: 'places',
      n: 2,
    });
  });

  it('sends nobody anywhere for a rule with no place of its own', () => {
    const crew = rule('crew', { form_id: 'form-crew', kind: 'co_presence', min_members: 6 });
    const where = formWhere({ ...base, formId: 'form-crew', rules: [crew] });
    expect(where?.spots).toEqual([]);
    expect(where?.nearest).toBeNull();
    expect(where?.steps).toEqual([
      { kind: 'together', members: 6 },
      { kind: 'stay', minutes: 5 },
    ]);
  });

  it("prefers the trip's destination, then the easiest rule; null when nothing gives it", () => {
    const hoian = rule('hoian', {
      form_id: 'form-x',
      destination_id: HOIAN,
      geofences: fence('Old town', 15.877, 108.326),
    });
    const sunrise = rule('sunrise', {
      form_id: 'form-x',
      solar: 'by_sunrise',
      poi_ids: '["poi-peak"]',
    });
    const plain = rule('plain', { form_id: 'form-x', poi_ids: '["poi-bridge"]' });
    const where = formWhere({ ...base, formId: 'form-x', rules: [hoian, sunrise, plain] });
    expect(where?.spots.map((s) => s.name)).toEqual(['Dragon Bridge', 'Bàn Cờ Peak']);
    expect(where?.steps).toEqual([
      { kind: 'go', places: 1 },
      { kind: 'stay', minutes: 5 },
    ]);
    // On a trip elsewhere the form's own places still show.
    expect(
      formWhere({ ...base, destinationId: 'dest-hue', formId: 'form-x', rules: [hoian] })?.spots[0]
        ?.name,
    ).toBe('Old town');
    expect(formWhere({ ...base, formId: 'form-none', rules: [plain] })).toBeNull();
  });
});

describe("a destination's spots for NEAR ME", () => {
  const rules = [
    rule('c', { form_id: 'form-c', poi_ids: '["poi-bridge","poi-peak"]' }),
    rule('r', { form_id: 'form-r', rarity: 'rare', poi_ids: '["poi-peak"]' }),
    rule('h', { form_id: 'form-h', destination_id: HOIAN, poi_ids: '["poi-pagoda"]' }),
  ];

  it('marks each spot with the rarest tier still waiting there', () => {
    const spots = destinationSpots({
      rules,
      pois: POIS,
      destinationId: DANANG,
      foundFormIds: new Set(['form-c']),
      position: BRIDGE,
    });
    expect(spots.map((s) => [s.name, s.forms, s.unfound])).toEqual([
      ['Dragon Bridge', 1, null],
      ['Bàn Cờ Peak', 2, 'rare'],
    ]);
  });

  it('is empty without a destination', () => {
    expect(
      destinationSpots({
        rules,
        pois: POIS,
        destinationId: null,
        foundFormIds: new Set(),
        position: null,
      }),
    ).toEqual([]);
  });
});

describe('where the map opens', () => {
  it('fits every spot, and the phone when it is close', () => {
    const lone = mapFraming([BRIDGE], null);
    expect(lone).toEqual({ center: BRIDGE, zoom: 15 });
    const spread = mapFraming(
      [
        { lat: 16.0611, lng: 108.2277 },
        { lat: 16.1186, lng: 108.2733 },
      ],
      null,
    );
    expect(spread?.center.lat).toBeCloseTo(16.08985, 4);
    // 6.4 km north to south over 200 points of map, 4.9 km east to west over 180: about 10.8.
    expect(spread?.zoom).toBeGreaterThanOrEqual(10.5);
    expect(spread?.zoom).toBeLessThan(11.2);
    // A phone at home, far away, does not drag the map out to the whole country.
    expect(mapFraming([BRIDGE], { lat: 10.776, lng: 106.7 })).toEqual(lone);
    expect(mapFraming([], null)).toBeNull();
  });
});
