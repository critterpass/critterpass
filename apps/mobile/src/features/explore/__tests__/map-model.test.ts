import { describe, expect, it } from '@jest/globals';

import {
  centreOf,
  distanceMeters,
  filterCounts,
  filterPlaces,
  orderPlaces,
  presence,
  type FilterContext,
  type MapPoi,
} from '../map-model';

const allDay = [{ start: '09:00', end: '17:00' }];
const week = {
  weekly: { mo: allDay, tu: allDay, we: allDay, th: allDay, fr: allDay, sa: allDay, su: allDay },
};
const poi = (id: string, name: string, category: string, hours: unknown = null): MapPoi => ({
  id,
  name,
  nameLocal: null,
  category,
  lat: 16.06,
  lng: 108.22,
  hours,
  mustSee: false,
  written: false,
});
const places = [
  poi('con', 'Chợ Cồn', 'market', week),
  poi('mykhe', 'Bãi biển Mỹ Khê', 'beach'),
  poi('sontra', 'Bán đảo Sơn Trà', 'nature'),
  { ...poi('bami', 'Bánh mì Bà Lan', 'food', week), nameLocal: 'Ba Lan bakery' },
];
// 03:00 UTC is 10:00 in Đà Nẵng.
const context: FilterContext = {
  savedIds: new Set(['mykhe', 'bami']),
  crewIds: new Set(['sontra']),
  tz: 'Asia/Ho_Chi_Minh',
  now: new Date('2026-10-02T03:00:00Z'),
};

describe('filters and search', () => {
  it('shows everything, in the order given, with no filter', () => {
    expect(filterPlaces(places, new Set(), '', context).map((p) => p.id)).toEqual([
      'con',
      'mykhe',
      'sontra',
      'bami',
    ]);
  });

  it('keeps only places every active chip allows', () => {
    expect(filterPlaces(places, new Set(['saved']), '', context).map((p) => p.id)).toEqual([
      'mykhe',
      'bami',
    ]);
    expect(filterPlaces(places, new Set(['saved', 'food']), '', context).map((p) => p.id)).toEqual([
      'bami',
    ]);
    expect(filterPlaces(places, new Set(['crew']), '', context).map((p) => p.id)).toEqual([
      'sontra',
    ]);
  });

  it('counts unknown hours as not open, and closed places out of OPEN NOW', () => {
    expect(filterPlaces(places, new Set(['open']), '', context).map((p) => p.id)).toEqual([
      'con',
      'bami',
    ]);
    const night = { ...context, now: new Date('2026-10-02T15:00:00Z') };
    expect(filterPlaces(places, new Set(['open']), '', night)).toEqual([]);
  });

  it('finds Vietnamese names typed without marks, and local names', () => {
    expect(filterPlaces(places, new Set(), 'cho con', context).map((p) => p.id)).toEqual(['con']);
    expect(filterPlaces(places, new Set(), 'my khe', context).map((p) => p.id)).toEqual(['mykhe']);
    expect(filterPlaces(places, new Set(), 'bakery', context).map((p) => p.id)).toEqual(['bami']);
    expect(filterPlaces(places, new Set(), 'sushi', context)).toEqual([]);
  });

  it('counts what each chip would show', () => {
    expect(filterCounts(places, context)).toEqual({ saved: 2, crew: 1, food: 2, open: 2 });
  });
});

describe('the order places are shown in', () => {
  const at = (id: string, lat: number, over: Partial<MapPoi> = {}): MapPoi => ({
    ...poi(id, id, 'food'),
    lat,
    lng: 108.22,
    ...over,
  });
  const list = [
    at('far-bar', 16.2),
    at('near-bar', 16.061),
    at('written-far', 16.3, { written: true }),
    at('written-near', 16.07, { written: true }),
    at('must-far', 16.4, { mustSee: true, written: true }),
    at('must-near', 16.08, { mustSee: true }),
  ];
  const here = { lat: 16.06, lng: 108.22 };

  it('puts must-sees first, then written-up places, then the rest, nearest first in each', () => {
    expect(orderPlaces(list, here).map((p) => p.id)).toEqual([
      'must-near',
      'must-far',
      'written-near',
      'written-far',
      'near-bar',
      'far-bar',
    ]);
  });

  it("measures from the destination's middle when it does not know where the viewer is", () => {
    const two = [at('south', 16.0), at('north', 16.5), at('mid', 16.26)];
    expect(orderPlaces(two, null).map((p) => p.id)).toEqual(['mid', 'north', 'south']);
  });

  it('settles a tie by name', () => {
    const same = [at('b', 16.06), at('a', 16.06)];
    expect(orderPlaces(same, here).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('where you are', () => {
  const daNang = [
    { lat: 16.06, lng: 108.22 },
    { lat: 16.1, lng: 108.25 },
  ];

  it('measures great-circle distance', () => {
    const saigon = { lat: 10.82, lng: 106.63 };
    expect(Math.round(distanceMeters(saigon, { lat: 16.06, lng: 108.22 }) / 1000)).toBe(607);
  });

  it('is here inside the destination and away with a distance outside it', () => {
    expect(presence({ lat: 16.07, lng: 108.23 }, daNang).kind).toBe('here');
    const away = presence({ lat: 10.82, lng: 106.63 }, daNang);
    expect(away.kind).toBe('away');
    expect(away.kind === 'away' && away.meters > 600_000).toBe(true);
  });

  it('is unknown with no fix or no places', () => {
    expect(presence(null, daNang)).toEqual({ kind: 'unknown' });
    expect(presence({ lat: 1, lng: 1 }, [])).toEqual({ kind: 'unknown' });
    expect(centreOf([])).toBeNull();
  });
});
