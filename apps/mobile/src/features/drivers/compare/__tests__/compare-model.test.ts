import { describe, expect, it } from '@jest/globals';
import { compareColumn, EMPTY_DRIVER_CARD, type CompareDay, type DriverCard } from '@cp/domain';

import type { ShortlistDriver } from '../../shared/api';
import { candidateOf, partyPrice } from '../compare-model';

const DAYS: readonly CompareDay[] = [
  { date: '2026-10-14', hours: 11.5 },
  { date: '2026-10-18', hours: 3 },
];
const card = (over: Partial<DriverCard>): DriverCard => ({
  ...EMPTY_DRIVER_CARD,
  name: 'Made',
  currency: 'IDR',
  price_unit: 'day',
  ...over,
});
const driver = { id: 'made', name: 'Made', terms: { source: 'found' } } as ShortlistDriver;
const each = (c: DriverCard, days = DAYS, people = 6) =>
  compareColumn(candidateOf(driver, c, days, people), days, people).eachMinor;

describe('what each person pays, whatever the price is counted by', () => {
  it('splits the price of the car across the party', () => {
    expect(each(card({ price_minor: 65_000_000, seats: 6 }))).toBe(21_666_667);
  });

  it('charges a price per person to each person, not split and not per car', () => {
    expect(each(card({ price_minor: 45_000_000, price_per: 'person', seats: 4 }))).toBe(90_000_000);
    expect(each(card({ price_minor: 45_000_000, price_per: 'person', price_unit: 'trip' }))).toBe(
      45_000_000,
    );
  });

  it('charges a price per hour for the hours of each day, at least the hours he asks for', () => {
    const hourly = card({
      price_minor: 9_000_000,
      price_per: 'hour',
      price_unit: 'hours',
      included_hours: 4,
      seats: 6,
    });
    // 11.5 hours, then 3 hours charged as his 4-hour minimum.
    expect(each(hourly)).toBe((9_000_000 * 15.5) / 6);
    // Two cars for six in a four-seater.
    expect(each({ ...hourly, seats: 4 })).toBe((9_000_000 * 15.5 * 2) / 6);
  });

  it('has no total for an hourly rate while a day has no times', () => {
    const hourly = card({ price_minor: 9_000_000, price_per: 'hour', price_unit: 'hours' });
    expect(each(hourly, [...DAYS, { date: '2026-10-19', hours: null }])).toBeNull();
  });

  it('does not read the least hours of an hourly rate as a day the price covers', () => {
    const hourly = card({ price_minor: 9_000_000, price_per: 'hour', included_hours: 4 });
    const column = compareColumn(candidateOf(driver, hourly, DAYS, 6), DAYS, 6);
    expect(column.longDays).toEqual([]);
    expect(partyPrice(card({ price_minor: 65_000_000, included_hours: 10 }), DAYS, 6)).toEqual({
      priceMinor: 65_000_000,
      priceUnit: 'day',
      includedHours: 10,
    });
  });

  it('has nothing to split when he gave no one price', () => {
    expect(each(card({ price_minor: null, currency: null, price_ask: '550k / 950k' }))).toBeNull();
  });
});
