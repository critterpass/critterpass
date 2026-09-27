import { describe, expect, it } from 'vitest';

import {
  adjustTempForElevation,
  isFareStale,
  monthKeyIn,
  nearestFareHub,
  nextMonthKeys,
  priceIndexFromFares,
  seasonEditorialSchema,
} from '../../src/travel-data';

describe('fare helpers', () => {
  it('picks the nearest hub other than the origin itself', () => {
    expect(nearestFareHub(21.0285, 105.8542)?.iata).toBe('HKG');
    expect(nearestFareHub(1.3644, 103.9915, 'SIN')?.iata).toBe('KUL');
  });

  it('treats a price older than 72 h, or never fetched, as stale', () => {
    const now = new Date('2026-09-28T00:00:00Z');
    expect(isFareStale(new Date('2026-09-25T01:00:00Z'), now)).toBe(false);
    expect(isFareStale(new Date('2026-09-24T23:00:00Z'), now)).toBe(true);
    expect(isFareStale(null, now)).toBe(true);
  });

  it('counts months across a year boundary in the refresh zone', () => {
    expect(monthKeyIn(new Date('2026-12-31T17:00:00Z'), 'Asia/Singapore')).toBe('2027-01');
    expect(nextMonthKeys('2026-11', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('priceIndexFromFares', () => {
  const sample = (month: number, prices: number[]) => ({
    month,
    pricesByOrigin: new Map(prices.map((price, index) => [`O${index}`, price])),
  });

  it('scales the median fare of each covered month from 0 (cheapest) to 100 (dearest)', () => {
    const index = priceIndexFromFares([
      sample(1, [100, 110, 120]),
      sample(4, [300, 310, 900]),
      sample(7, [200, 205, 210, 215]),
    ]);
    expect(Object.fromEntries(index)).toEqual({ 1: 0, 4: 100, 7: 49 });
  });

  it('leaves out months with fewer than three origins and needs two covered months', () => {
    expect(priceIndexFromFares([sample(1, [100, 110]), sample(2, [150, 160, 170])]).size).toBe(0);
  });
});

describe('seasonEditorialSchema', () => {
  const month = {
    month: 4,
    crowd_index: 95,
    price_index: null,
    highlight_tag: 'APR BLOSSOMS',
    colour_role: 'peak',
    source: 'JNTO',
    source_url: 'https://www.japan.travel/',
    sourced_on: '2026-09-28',
  };
  const event = {
    key: 'cherry-blossom',
    kind: 'blossom',
    name: 'Cherry blossom',
    starts_on: '2027-03-26',
    ends_on: '2027-04-10',
    confidence: 'typical',
    source: 'JMA',
    source_url: null,
    sourced_on: '2026-09-28',
  };

  it('accepts sourced months and events', () => {
    expect(seasonEditorialSchema.safeParse({ months: [month], events: [event] }).success).toBe(
      true,
    );
  });

  it('rejects a repeated month, a blank source, reversed dates and a non-kebab key', () => {
    const bad = [
      { months: [month, month], events: [] },
      { months: [{ ...month, source: ' ' }], events: [] },
      { months: [], events: [{ ...event, ends_on: '2027-03-01' }] },
      { months: [], events: [{ ...event, key: 'Cherry Blossom' }] },
    ];
    for (const value of bad) expect(seasonEditorialSchema.safeParse(value).success).toBe(false);
  });
});

describe('adjustTempForElevation', () => {
  it('cools about 6.5 °C per 1,000 m climbed', () => {
    expect(adjustTempForElevation(24, 200, 1717)).toBe(14.1);
    expect(adjustTempForElevation(10, 1000, 0)).toBe(16.5);
  });
});
