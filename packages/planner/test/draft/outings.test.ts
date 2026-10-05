/**
 * Outings: far essentials that sit together share one ride out on one full day, and a short trip
 * gives its full days to the outings that hold the most for the time they take.
 */
import { describe, expect, it } from 'vitest';

import { planOutings, type DraftPoi } from '../../src/draft/index';
import { keepOutingsTogether } from '../../src/draft/outings';
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
    // Kept on the trip: it keeps its days, to share one.
    const open = new Map(all.map((poi) => [poi.id, [1, 2, 3, 4]]));
    keepOutingsTogether(open, outings, new Set());
    expect(open.get(caves.id)).toEqual([1, 2, 3, 4]);
  });
});
