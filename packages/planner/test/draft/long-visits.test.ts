/**
 * Places that take hours: a half-day visit has its half to itself but for one light stop, a
 * whole-day visit has its day and never the day the crew lands or leaves, a stop inside the
 * place is part of the visit, and a length missing from the place is read from its kind and notes.
 */
import type { DraftItem } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { derivedDurationMin, visitSpan } from '../../src/draft/index';
import { longVisitFaults } from '../../src/draft/long-visits';
import type { TimedDay, TimedStop } from '../../src/draft/validate-day-sense';
import { id, place } from './day-sense-fixture';

const falls = place(1, 'Waterfall park', 'nature', { durationMin: 180, lat: 11.9, lng: 108.45 });
const hills = place(2, 'Hill resort', 'nature', { durationMin: 420, lat: 16.0, lng: 107.99 });
const temple = place(3, 'Temple', 'temple_shrine', { lat: 11.95, lng: 108.44 });
const cafe = place(4, 'Café', 'food', { tags: ['cafe'], durationMin: 45, lat: 11.94, lng: 108.44 });
const bakery = place(5, 'Bakery', 'food', {
  tags: ['bakery'],
  durationMin: 30,
  lat: 11.94,
  lng: 108.43,
});
const lunch = place(6, 'Lunch', 'food', { lat: 11.93, lng: 108.44 });
const coaster = place(7, 'Coaster', 'nature', { lat: 11.9005, lng: 108.4505 });
const bridge = place(8, 'Bridge on the hill', 'museum', { lat: 16.004, lng: 107.993 });

const timed = (
  poi: typeof falls,
  startMin: number,
  kind: DraftItem['kind'] = 'activity',
): TimedStop => ({
  item: {
    stable_id: id(100 + startMin),
    kind,
    poi_id: poi.id,
    starts_at: '2026-10-20T00:00:00Z',
    ends_at: '2026-10-20T01:00:00Z',
    tz: 'Asia/Ho_Chi_Minh',
    must_do_id: null,
    booking_id: null,
    locked_reason: null,
    cost_model: 'per_person',
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
const day = (stops: TimedStop[], dayNo = 2): TimedDay => ({
  dayNo,
  date: '2026-10-20',
  window: { startMin: 8 * 60, endMin: 21 * 60 },
  stops,
});
const faulted = (d: TimedDay, edge = false) =>
  longVisitFaults(d, edge).map((fault) => fault.stop.poi.name);

describe('long visits', () => {
  it('reads half and whole days from the length', () => {
    expect(visitSpan(falls)).toBe('half');
    expect(visitSpan(hills)).toBe('full');
    expect(visitSpan(temple)).toBeNull();
  });

  it('gives a half-day visit its half: one light stop beside it, no other sight', () => {
    expect(faulted(day([timed(falls, 8 * 60), timed(cafe, 11 * 60 + 15)]))).toEqual([]);
    expect(faulted(day([timed(falls, 8 * 60), timed(temple, 11 * 60 + 15)]))).toEqual(['Temple']);
    expect(
      faulted(day([timed(falls, 8 * 60), timed(cafe, 11 * 60), timed(bakery, 11 * 60 + 45)])),
    ).toEqual(['Bakery']);
    // The other half of the day is free for other sights, and meals never count.
    expect(
      faulted(day([timed(falls, 8 * 60), timed(lunch, 12 * 60, 'meal'), timed(temple, 14 * 60)])),
    ).toEqual([]);
    // A stop inside the park is part of the visit.
    expect(faulted(day([timed(falls, 8 * 60), timed(coaster, 11 * 60)]))).toEqual([]);
  });

  it('gives a whole-day visit its day, never the day the crew lands or leaves', () => {
    expect(faulted(day([timed(hills, 8 * 60), timed(temple, 17 * 60)]))).toEqual(['Temple']);
    expect(faulted(day([timed(hills, 8 * 60), timed(bridge, 11 * 60)]))).toEqual([]);
    expect(faulted(day([timed(hills, 8 * 60)], 1), true)).toEqual(['Hill resort']);
  });

  it('reads a missing length from the notes, then the kind', () => {
    expect(derivedDurationMin('nature', [], ['Give it a full day: the cable car is long'])).toBe(
      420,
    );
    expect(derivedDurationMin('nature', [], ['Đi nửa ngày là vừa'])).toBe(240);
    expect(derivedDurationMin('other', ['theme_park'], [])).toBe(420);
    expect(derivedDurationMin('nature', ['hiking'], [null])).toBe(240);
    expect(derivedDurationMin('museum', [], [])).toBe(120);
  });
});
