/**
 * Outings: far essentials that sit together share one ride out on one full day, and a short trip
 * gives its full days to the outings that hold the most for the time they take.
 */
import { describe, expect, it } from 'vitest';

import { planOutings, type DraftPoi } from '../../src/draft/index';
import { farAfterDayOut, keepOutingsTogether, offTheOuting } from '../../src/draft/outings';
import { id, line, place } from './day-sense-fixture';

describe('outings', () => {
  // Home at 0; an old town 45 minutes out with a bridge and a beach beside it; a peninsula 50
  // minutes the other way with a pagoda on it; a hill resort an hour out; two sights in town.
  const at = (n: number, name: string, minutes: number, essential = true): DraftPoi =>
    place(n, name, 'museum', { durationMin: minutes, essential });
  const town = [at(200, 'Market', 60), at(201, 'Bridge in town', 30)];
  const oldTown = [
    at(210, 'Old Town', 180),
    at(211, 'Covered Bridge', 30),
    at(212, 'Town Beach', 90),
  ];
  const peninsula = [at(220, 'Peninsula', 240), at(221, 'Pagoda', 45)];
  const hills = [at(230, 'Hill Resort', 300)];
  const travel = line({
    home: 0,
    [id(200)]: 3,
    [id(201)]: 5,
    [id(210)]: 45,
    [id(211)]: 47,
    [id(212)]: 60,
    [id(220)]: -50,
    [id(221)]: -32,
    [id(230)]: -120,
  });
  const all = [...town, ...oldTown, ...peninsula, ...hills];
  const plan = (days: number, asked: string[] = []) =>
    planOutings({
      places: all,
      travel,
      homeId: 'home',
      hopCapMin: 40,
      days,
      openDays: new Map(all.map((poi) => [poi.id, Array.from({ length: days }, (_, i) => i + 1)])),
      asked: new Set(asked),
    });
  const names = (ids: readonly string[]) =>
    ids.map((poiId) => all.find((p) => p.id === poiId)?.name);

  it('puts far places that sit together on one full day, and leaves town places alone', () => {
    const outings = plan(5);
    expect(outings.map((outing) => names(outing.poiIds))).toEqual([
      ['Old Town', 'Town Beach', 'Covered Bridge'],
      ['Peninsula', 'Pagoda'],
      ['Hill Resort'],
    ]);
    // Three full days, three outings: never the day the crew lands or leaves.
    expect(outings.map((outing) => outing.dayNo)).toEqual([2, 3, 4]);
  });

  it('gives a short trip’s one full day to the outing with the most for its time', () => {
    const outings = plan(3);
    expect(outings.map((outing) => [names(outing.poiIds)[0], outing.dayNo])).toEqual([
      ['Old Town', 2],
      ['Peninsula', null],
      ['Hill Resort', null],
    ]);
    // What the crew asked for comes before what holds more.
    expect(plan(3, [id(230)]).map((outing) => [names(outing.poiIds)[0], outing.dayNo])).toEqual([
      ['Hill Resort', 2],
      ['Old Town', null],
      ['Peninsula', null],
    ]);
    expect(plan(2).every((outing) => outing.dayNo === null)).toBe(true);
  });
});

describe('outings by length', () => {
  const at = (n: number, name: string, minutes: number): DraftPoi =>
    place(n, name, 'nature', { durationMin: minutes, essential: true });
  const park = at(300, 'Theme park in town', 420);
  const caves = at(301, 'Marble caves', 90);
  const resort = at(302, 'Hill resort', 300);
  const all = [park, caves, resort];
  const travel = line({ home: 0, [id(300)]: 10, [id(301)]: -38, [id(302)]: 120 });
  const plan = (days: number) =>
    planOutings({
      places: all,
      travel,
      homeId: 'home',
      hopCapMin: 40,
      days,
      openDays: new Map(all.map((poi) => [poi.id, Array.from({ length: days }, (_, i) => i + 1)])),
      asked: new Set(),
    });

  it('gives a place that takes the whole day a day out, near or far', () => {
    expect(plan(4).find((o) => o.poiIds.includes(park.id))?.dayNo).not.toBeNull();
  });

  it('lets a short outing share a day when the long ones took the full days', () => {
    const outings = plan(4);
    const short = outings.find((o) => o.poiIds.includes(caves.id));
    expect(short?.short).toBe(true);
    expect(short?.dayNo).toBeNull();
    expect(outings.filter((o) => !o.short).map((o) => o.dayNo)).toEqual([2, 3]);
    // Kept on the trip: it keeps its town days, to share one.
    const open = new Map(all.map((poi) => [poi.id, [1, 2, 3, 4]]));
    keepOutingsTogether(open, outings, new Set());
    expect(open.get(caves.id)).toEqual([1, 4]);
  });
});

describe('a day out, kept together', () => {
  const at = (n: number, name: string, minutes: number, lat = 16, lng = 108): DraftPoi =>
    place(n, name, 'nature', { durationMin: minutes, essential: true, lat, lng });
  // The stay at the centre; the old town 23 km south; the caves on the road to it; a peak.
  const home = at(400, 'Stay', 30, 16.064, 108.23);
  const oldTown = at(401, 'Old Town', 240, 15.879, 108.328);
  const caves = at(402, 'Marble caves', 150, 16.003, 108.264);
  const other = at(403, 'Pass in the north', 60, 16.2, 108.13);
  const all = [oldTown, caves, other];
  const travel = line({ home: 0, [id(401)]: 41, [id(402)]: -38, [id(403)]: 80 });

  it('lets a short outing on the road to a day out join it', () => {
    const outings = planOutings({
      places: all,
      travel,
      homeId: 'home',
      hopCapMin: 40,
      days: 3,
      openDays: new Map(all.map((poi) => [poi.id, [1, 2, 3]])),
      asked: new Set(),
      home,
    });
    const day2 = outings.find((o) => o.dayNo === 2);
    expect(day2?.poiIds).toEqual([oldTown.id, caves.id]);
    // The pass is off the road: it does not join.
    expect(outings.find((o) => o.poiIds.includes(other.id))?.dayNo).toBeNull();
  });
});

describe('stops beside a day out', () => {
  const peninsula = place(410, 'Peninsula', 'nature', { durationMin: 180 });
  const pagoda = place(411, 'Pagoda', 'temple_shrine');
  const peak = place(412, 'Peak', 'nature');
  const park = place(413, 'Park in town', 'nature');
  const dinner = place(414, 'Dinner in town', 'food');
  const farDinner = place(415, 'Dinner off the road', 'food');
  const travel = line({
    home: 0,
    [id(410)]: 40,
    [id(411)]: 35,
    [id(412)]: 45,
    [id(413)]: 2,
    [id(414)]: 3,
    [id(415)]: -36,
  });
  const stop = (poi: DraftPoi, startMin: number, kind: 'activity' | 'meal' = 'activity') => ({
    item: {
      stable_id: id(500 + startMin),
      kind,
      poi_id: poi.id,
      starts_at: '2026-10-21T00:00:00Z',
      ends_at: '2026-10-21T01:00:00Z',
      tz: 'Asia/Ho_Chi_Minh',
      must_do_id: null,
      booking_id: null,
      locked_reason: null,
      cost_model: 'per_person' as const,
      amount_minor: 0,
      currency: 'VND',
      travel_min: 0,
      note: null,
    },
    poi,
    startMin,
    endMin: startMin + poi.durationMin,
    held: false,
  });
  const day = (stops: ReturnType<typeof stop>[]) => ({
    dayNo: 3,
    date: '2026-10-21',
    window: { startMin: 8 * 60, endMin: 21 * 60 },
    stops,
  });
  const short = [{ poiIds: [peninsula.id, pagoda.id], dayNo: 3, minutes: 300, short: false }];
  const whole = [{ poiIds: [peninsula.id], dayNo: 3, minutes: 480, short: false }];

  it('never puts a town stop between two stops of an outing', () => {
    const zigzag = day([stop(pagoda, 600), stop(peninsula, 675), stop(park, 900), stop(peak, 990)]);
    expect(offTheOuting(zigzag, short, travel, 40).map((s) => s.poi.name)).toEqual([
      'Park in town',
    ]);
    // After the outing, town is the rest of a shorter day out's afternoon.
    const after = day([stop(pagoda, 600), stop(peninsula, 675), stop(park, 900)]);
    expect(offTheOuting(after, short, travel, 40)).toEqual([]);
  });

  it('keeps the evening after a whole day out near the stay or on the way home', () => {
    const far = day([stop(peninsula, 600), stop(farDinner, 1080, 'meal'), stop(park, 1170)]);
    expect(farAfterDayOut(far, whole, travel, 'home', 40).map((s) => s.poi.name)).toEqual([
      'Dinner off the road',
    ]);
    const home = day([stop(peninsula, 600), stop(dinner, 1080, 'meal'), stop(park, 1170)]);
    expect(farAfterDayOut(home, whole, travel, 'home', 40)).toEqual([]);
  });
});
