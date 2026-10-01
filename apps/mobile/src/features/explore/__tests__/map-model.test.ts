import { describe, expect, it } from '@jest/globals';

import {
  centreOf,
  distanceMeters,
  filterCounts,
  filterPlaces,
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
  it('shows everything by name with no filter', () => {
    expect(filterPlaces(places, new Set(), '', context).map((p) => p.id)).toEqual([
      'mykhe',
      'sontra',
      'bami',
      'con',
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
      'bami',
      'con',
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
