/**
 * Where a day is spent, on the plan screens: a day trip carries its area's name and a mark on its
 * chip, loses the base city's stay, and gets its own map; a one-stop trip's days, chips and map
 * are what they were.
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import type { PlanState } from '@cp/domain';
import { loadCatalog } from '@cp/i18n';
import { i18n } from '@lingui/core';

import type { AreaLink } from '@/data/areas/area-links';
import { buildTripAreas } from '@/data/areas/trip-areas-model';
import type { DayItem } from '@/data/plan/plan-model';

import { withArea } from '../format';
import { dayChips } from '../sheet-copy';
import { buildTripDays, dayAreaMarks, mapAreaOf, type TripDay } from '../trip-days';
import { viewPoints } from '../trip-map-camera';

const CUSCO = 'cusco';
const MACHU = 'machu';
const link: AreaLink = {
  id: 'l1',
  kind: 'day_trip',
  fromId: CUSCO,
  toId: MACHU,
  toName: 'Machu Picchu',
  toSlug: 'machu-picchu',
  minutes: 210,
  mode: 'train',
  dayLength: 'full',
  essential: true,
  cost: null,
  note: null,
  sources: [],
};
const state = (areas: Record<number, string> = {}): PlanState => ({
  days: [1, 2, 3].map((n) => ({
    day_no: n,
    date: `2026-11-1${n}`,
    theme: null,
    ...(areas[n] === undefined ? {} : { destination_id: areas[n] }),
  })),
  items: [
    {
      stable_id: 'hotel',
      day_no: 1,
      lane: null,
      poi_id: 'p-hotel',
      booking_id: null,
      must_do_id: null,
      notes: null,
      category: 'stay',
      created_by_kind: 'user',
    },
  ],
});
const display = new Map([['hotel', { title: 'Hotel', place: { lat: -13.5167, lng: -71.9781 } }]]);
const days = (plan: PlanState, on: boolean) =>
  buildTripDays({
    state: plan,
    display,
    dayRows: [],
    themes: new Map(),
    tz: 'America/Lima',
    polls: [],
    issues: [],
    areas: dayAreaMarks(
      buildTripAreas({
        on,
        destinationId: CUSCO,
        destinationName: 'Cusco',
        stops: [],
        days: plan.days,
        links: [link],
      }),
    ),
  });

beforeAll(async () => {
  i18n.loadAndActivate({ locale: 'en', messages: await loadCatalog('en', 'plan/trip-map') });
});

describe('a day and its area', () => {
  it('names the area on a day trip and nothing on a city day', () => {
    const [, second, third] = days(state({ 3: MACHU }), true);
    expect(second?.area).toBeUndefined();
    expect(third?.area).toEqual({ id: MACHU, name: 'Machu Picchu', link });
    expect(withArea('Wed 14', second as TripDay)).toBe('Wed 14');
    expect(withArea('Fri 13', third as TripDay)).toBe('Fri 13 · Machu Picchu');
  });

  it("draws the stay only on days spent in the stay's own area", () => {
    const [, second, third] = days(state({ 3: MACHU }), true);
    expect(second?.stay).not.toBeNull();
    expect(third?.stay).toBeNull();
  });

  it('builds a one-stop trip exactly as before, switch on or off', () => {
    const plain = buildTripDays({
      state: state(),
      display,
      dayRows: [],
      themes: new Map(),
      tz: 'America/Lima',
      polls: [],
      issues: [],
    });
    expect(days(state(), true)).toEqual(plain);
    expect(days(state({ 3: MACHU }), false)).toEqual(plain);
    expect(dayChips(days(state(), true), 'en')).toEqual(dayChips(plain, 'en'));
  });

  it('marks the day trip on its chip and names the area in its label', () => {
    const chips = dayChips(days(state({ 3: MACHU }), true), 'en');
    expect(chips[1]?.mark).toBeUndefined();
    expect(chips[2]?.mark).toBe(true);
    expect(chips[2]?.accessibilityLabel).toContain('Machu Picchu');
  });
});

describe('the map of a day', () => {
  const HOTEL = { lat: -13.5167, lng: -71.9781 };
  const stop = (id: string, lat: number, lng: number) =>
    ({ stableId: id, place: { lat, lng } }) as unknown as DayItem;
  const cityDay = {
    dayNo: 1,
    stops: [stop('plaza', -13.5165, -71.9785)],
    stay: HOTEL,
  } as unknown as TripDay;
  const tripDay = {
    dayNo: 3,
    stops: [stop('gate', -13.1631, -72.545)],
    stay: null,
    area: { id: MACHU, name: 'Machu Picchu', link },
  } as unknown as TripDay;
  const model = { days: [cityDay, tripDay], ideas: [], center: null };

  it('frames a day-trip day with no point of the base city', () => {
    expect(viewPoints(model, tripDay)).toEqual([[-72.545, -13.1631]]);
  });

  it('frames the first stop for the whole trip: a day trip is reached by choosing its day', () => {
    expect(viewPoints(model, null)).toEqual([[-71.9785, -13.5165]]);
  });

  it("frames an empty day trip on its own area, never on the city's saved places", () => {
    const empty = { ...tripDay, stops: [] } as TripDay;
    const saved = [{ lat: HOTEL.lat, lng: HOTEL.lng }] as never;
    expect(viewPoints({ days: [empty], ideas: saved, center: [-72.5, -13.2] }, empty)).toEqual([
      [-72.5, -13.2],
    ]);
  });

  it("picks the area's pack for a day in it and the trip's for the others", () => {
    const trip = { id: CUSCO, slug: 'cusco' };
    expect(mapAreaOf(trip, tripDay)).toEqual({ id: MACHU, slug: 'machu-picchu' });
    expect(mapAreaOf(trip, cityDay)).toBe(trip);
    expect(mapAreaOf(trip, null)).toBe(trip);
  });
});
