/**
 * A trip's areas from the rows on the phone: which stop a day belongs to, the area it is spent in,
 * when that makes it a day trip, and what the switch being off does to all of it. The links are an
 * answer of `GET /v1/destinations/{id}/links` in its recorded shape.
 */
import { describe, expect, it } from '@jest/globals';

import { destinationLinksSchema, linksOf } from '../area-links';
import { dayAreaOutcome } from '../commands';
import { buildTripAreas, dayOfArea, nextFreeStop } from '../trip-areas-model';
import recorded from './fixtures/links-cusco.json';

const CUSCO = '0192f000-0000-7000-8000-00000000c05c';
const LIMA = '0192f000-0000-7000-8000-00000000c05d';
const MACHU = '0192f000-0000-7000-8000-0000000a4ea2';
const parsed = destinationLinksSchema.safeParse(recorded);
const links = parsed.success ? linksOf(parsed.data) : [];
const days = (areas: Record<number, string> = {}) =>
  [1, 2, 3, 4, 5].map((n) => ({ id: `d${n}`, day_no: n, destination_id: areas[n] ?? null }));
const base = { destinationId: CUSCO, destinationName: 'Cusco', stops: [], links };

describe('buildTripAreas', () => {
  it('puts every day of a trip with no stop rows at its one destination', () => {
    const areas = buildTripAreas({ ...base, on: true, days: days() });
    expect(areas.stops).toEqual([
      { index: 0, destinationId: CUSCO, name: 'Cusco', firstDay: 1, lastDay: 5 },
    ]);
    expect(areas.days.every((day) => day.areaId === CUSCO && !day.dayTrip)).toBe(true);
    expect(areas.days.every((day) => day.areaName === null && day.link === null)).toBe(true);
  });

  it('gives each day of a two-stop trip its stop, the travel day to the stop it arrives at', () => {
    const areas = buildTripAreas({
      ...base,
      on: true,
      destinationId: LIMA,
      stops: [
        { position: 1, destination_id: LIMA, nights: 2, name: 'Lima' },
        { position: 2, destination_id: CUSCO, nights: 2, name: 'Cusco' },
      ],
      days: days(),
    });
    expect(areas.days.map((day) => day.areaId)).toEqual([LIMA, LIMA, CUSCO, CUSCO, CUSCO]);
    expect(areas.stops.map((stop) => [stop.firstDay, stop.lastDay])).toEqual([
      [1, 2],
      [3, 5],
    ]);
    expect(areas.days.some((day) => day.dayTrip)).toBe(false);
  });

  it('reads a day in a linked area as a day trip, with its link and the area named', () => {
    const areas = buildTripAreas({ ...base, on: true, days: days({ 3: MACHU }) });
    const day = areas.days[2];
    expect(day).toMatchObject({ dayNo: 3, areaId: MACHU, dayTrip: true, areaName: 'Machu Picchu' });
    expect(day?.link).toMatchObject({ minutes: 210, mode: 'train', dayLength: 'full' });
    expect(dayOfArea(areas, MACHU)?.dayNo).toBe(3);
    // The essential day trip leads; the way on to the next city is not a day trip.
    expect(areas.dayTrips.get(CUSCO)?.map((link) => link.toName)).toEqual([
      'Machu Picchu',
      'Sacred Valley',
    ]);
  });

  it('keeps a day trip whose link is gone, with the name its row gives and no link', () => {
    const areas = buildTripAreas({
      ...base,
      on: true,
      links: [],
      days: [{ day_no: 1, destination_id: MACHU, area_name: 'Machu Picchu' }],
    });
    expect(areas.days[0]).toMatchObject({ dayTrip: true, areaName: 'Machu Picchu', link: null });
  });

  it('answers one stop and no day trips while the switch is off, whatever rows are there', () => {
    const areas = buildTripAreas({
      ...base,
      on: false,
      stops: [
        { position: 1, destination_id: LIMA, nights: 2, name: 'Lima' },
        { position: 2, destination_id: CUSCO, nights: 2, name: 'Cusco' },
      ],
      days: days({ 3: MACHU }),
    });
    expect(areas.stops).toHaveLength(1);
    expect(areas.dayTrips.size).toBe(0);
    expect(areas.days.every((day) => !day.dayTrip && day.areaId === CUSCO)).toBe(true);
  });

  it('offers the day trips of the stop the next free day is in', () => {
    const stops = [
      { position: 1, destination_id: LIMA, nights: 1, name: 'Lima' },
      { position: 2, destination_id: CUSCO, nights: 3, name: 'Cusco' },
    ];
    const areas = buildTripAreas({ ...base, on: true, stops, days: days() });
    expect(nextFreeStop(areas, 1)?.destinationId).toBe(LIMA);
    expect(nextFreeStop(areas, 2)?.destinationId).toBe(CUSCO);
  });
});

describe('dayAreaOutcome', () => {
  it('reads the moved stops of an applied change and the reason of a refusal', () => {
    const version = '0192f000-0000-7000-8000-000000000201';
    const stable = '0192f000-0000-7000-8000-000000000301';
    expect(
      dayAreaOutcome({
        kind: 'applied',
        opId: 'op',
        result: { version_id: version, moved_stops: [{ stable_id: stable, to: 'ideas' }] },
      }),
    ).toEqual({
      ok: true,
      result: { version_id: version, moved_stops: [{ stable_id: stable, to: 'ideas' }] },
    });
    const refused = (code: string, reason?: string) =>
      dayAreaOutcome({ kind: 'rejected', opId: 'op', code, detail: { reason } });
    expect(refused('VALIDATION', 'other_time_zone')).toEqual({
      ok: false,
      refusal: 'other_time_zone',
    });
    expect(refused('STATE_INVALID', 'draft_running')).toEqual({
      ok: false,
      refusal: 'draft_running',
    });
    expect(refused('PLAN_VERSION_CONFLICT')).toEqual({ ok: false, refusal: 'plan_changed' });
    expect(refused('STATE_INVALID', 'trip_status')).toEqual({ ok: false, refusal: 'other' });
    expect(dayAreaOutcome({ kind: 'unavailable', opId: 'op', code: 'NETWORK' })).toEqual({
      ok: false,
      refusal: 'offline',
    });
  });
});
