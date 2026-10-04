/**
 * Her stops against the guide's day: a stop she placed goes back in at her time whatever the guide
 * returned, a stop of the guide's that overlaps it or repeats its place gives way, a must-do or a
 * booking of the guide's stays for her to settle, and a day with nothing of hers is left alone.
 */
import type { DraftDay, DraftItem } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { holdDay, holdStops, type HeldStop } from '../../../../src/jobs/ai/draft/held-stops';

const at = (hour: number, minute = 0) =>
  new Date(Date.UTC(2027, 2, 28, hour, minute)).toISOString();

function item(id: string, from: number, to: number, extra: Partial<DraftItem> = {}): DraftItem {
  return {
    stable_id: id,
    kind: 'activity',
    poi_id: `poi-${id}`,
    starts_at: at(from),
    ends_at: at(to),
    tz: 'UTC',
    must_do_id: null,
    booking_id: null,
    locked_reason: null,
    cost_model: 'per_person',
    amount_minor: 0,
    currency: 'USD',
    travel_min: 0,
    note: null,
    ...extra,
  };
}

const day = (items: DraftItem[], dayNo = 1): DraftDay => ({
  day_no: dayNo,
  date: '2027-03-28',
  theme: 'A day',
  items,
});
const travel = () => 15;
const hers = (id: string, from: number, to: number, extra: Partial<DraftItem> = {}): HeldStop => ({
  dayNo: 1,
  item: item(id, from, to, { locked_reason: 'user', ...extra }),
});

describe('holdDay', () => {
  it('puts her stop back at her time and takes out what overlaps it or repeats its place', () => {
    const held = [hers('mine', 10, 12, { poi_id: 'poi-temple' })];
    const guide = day([
      item('early', 8, 9),
      item('clash', 11, 13),
      item('again', 15, 16, { poi_id: 'poi-temple' }),
      // The guide moved her stop: it comes back as she placed it.
      item('mine', 16, 17, { poi_id: 'poi-temple' }),
      item('late', 17, 18),
    ]);
    const result = holdDay(guide, held, travel);
    expect(result.day.items.map((i) => [i.stable_id, i.starts_at])).toEqual([
      ['early', at(8)],
      ['mine', at(10)],
      ['late', at(17)],
    ]);
    expect(result.day.items[1]).toMatchObject({ locked_reason: 'user', travel_min: 15 });
    expect(result.gaveWay).toEqual(['clash', 'again']);
  });

  it("keeps the guide's must-do and a booking beside her stop, for her to settle", () => {
    const held = [hers('mine', 10, 12)];
    const guide = day([
      item('wish', 11, 12, { must_do_id: 'must-1', locked_reason: 'must_do' }),
      item('booked', 9, 11, { booking_id: 'booking-1', locked_reason: 'booking' }),
    ]);
    const result = holdDay(guide, held, travel);
    expect(result.day.items.map((i) => i.stable_id)).toEqual(['booked', 'mine', 'wish']);
    expect(result.gaveWay).toEqual([]);
  });

  it('takes out a must-do of the guide she already placed herself', () => {
    const held = [hers('mine', 10, 12, { must_do_id: 'must-1' })];
    const guide = day([item('wish', 15, 16, { must_do_id: 'must-1', locked_reason: 'must_do' })]);
    expect(holdDay(guide, held, travel).day.items.map((i) => i.stable_id)).toEqual(['mine']);
  });
});

describe('holdStops', () => {
  it('returns the itinerary as it came when nothing is held', () => {
    const itinerary = { currency: 'USD', days: [day([item('a', 9, 10)])] };
    expect(holdStops(itinerary, [], travel).itinerary).toBe(itinerary);
  });

  it('leaves a day without a stop of hers alone and holds her place on every day', () => {
    const held = [hers('mine', 10, 12, { poi_id: 'poi-temple' })];
    const other = day([item('b', 10, 12), item('again', 14, 15, { poi_id: 'poi-temple' })], 2);
    const quiet = day([item('c', 10, 12)], 3);
    const result = holdStops({ currency: 'USD', days: [day([]), other, quiet] }, held, travel);
    expect(result.itinerary.days.map((d) => d.items.map((i) => i.stable_id))).toEqual([
      ['mine'],
      ['b'],
      ['c'],
    ]);
    expect(result.itinerary.days[2]).toBe(quiet);
    expect(result.gaveWay).toEqual(['again']);
  });
});
