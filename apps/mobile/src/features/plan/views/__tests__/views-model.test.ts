/**
 * The map and calendar views over the Bali week: pins numbered in time order within each day, one
 * line per day with two or more places, a day filter, and month grids that start on Monday with
 * each trip date carrying its day and item count.
 */
import { describe, expect, it } from '@jest/globals';

import { BALI_DAYS, BALI_ITEMS } from '../../overview/dev/bali-plan';
import { calendarMonths, planMapModel } from '../model/views-model';

describe('plan map', () => {
  it('numbers each day’s places in time order and draws a line per day', () => {
    const model = planMapModel(BALI_ITEMS, null);
    const day3 = model.pins.filter((pin) => pin.dayNo === 3);
    expect(day3.map((pin) => [pin.number, pin.label])).toEqual([
      [1, 'Terraces 7am'],
      [2, 'Spa'],
      [3, 'Ridge walk'],
    ]);
    // Day 5 has one place, so no line.
    expect(model.routes.map((route) => route.dayNo)).toEqual([1, 2, 3, 4, 7]);
    expect(model.bounds).not.toBeNull();
  });

  it('filters to one day', () => {
    const model = planMapModel(BALI_ITEMS, 4);
    expect(model.pins.map((pin) => pin.label)).toEqual(['Pickup', 'Hot springs']);
    expect(model.routes).toHaveLength(1);
  });

  it('follows the road of each synced leg item to item, straight where a leg has none', () => {
    const [pickup, springs] = planMapModel(BALI_ITEMS, 4).pins;
    if (pickup === undefined || springs === undefined) throw new Error('day 4 has two places');
    const road: [number, number][] = [
      [pickup.lng, pickup.lat],
      [pickup.lng + 0.01, pickup.lat + 0.02],
      [springs.lng, springs.lat],
    ];
    const shaped = planMapModel(
      BALI_ITEMS,
      4,
      new Map([[`${pickup.stableId}>${springs.stableId}`, road]]),
    );
    expect(shaped.routes[0]?.coordinates).toEqual(road);
    const reversed = planMapModel(
      BALI_ITEMS,
      4,
      new Map([[`${springs.stableId}>${pickup.stableId}`, road]]),
    );
    expect(reversed.routes[0]?.coordinates).toEqual([
      [pickup.lng, pickup.lat],
      [springs.lng, springs.lat],
    ]);
  });
});

describe('plan calendar', () => {
  it('lays November out Monday first with the trip days filled in', () => {
    const [november, ...rest] = calendarMonths(BALI_DAYS, BALI_ITEMS, '2026-11-04');
    expect(rest).toEqual([]);
    expect(november?.month).toBe('2026-11-01');
    // 1 November 2026 is a Sunday, so the first row starts on Monday 26 October.
    expect(november?.weeks[0]?.[0]?.date).toBe('2026-10-26');
    const trip = november?.weeks.flat().filter((cell) => cell.dayNo !== null);
    expect(trip?.map((cell) => [cell.date.slice(8), cell.dayNo, cell.items])).toEqual([
      ['02', 1, 2],
      ['03', 2, 2],
      ['04', 3, 3],
      ['05', 4, 2],
      ['06', 5, 1],
      ['07', 6, 0],
      ['08', 7, 2],
    ]);
    expect(trip?.find((cell) => cell.today)?.dayNo).toBe(3);
  });

  it('has nothing to show while the dates are open', () => {
    expect(calendarMonths([{ dayNo: 1, date: null, theme: null }], [], null)).toEqual([]);
  });
});
