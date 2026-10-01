/**
 * Setup amounts quoted in dollars, read in the crew's currency: converted with the synced rates
 * and rounded as estimates, left as quoted when the device has no rate for them yet.
 */
import { describe, expect, it } from '@jest/globals';

import { estimateOf } from '../../rooms/model';
import { inCrewCurrency } from '../crew-money';

// One euro buys 1.25 dollars and 32,500 ₫: a dollar is 26,000 ₫.
const rate = (quote: string, value: string) => ({
  id: `fx-${quote}`,
  base: 'EUR',
  quote,
  rate: value,
  as_of: '2027-03-01',
  source: 'frankfurter',
});
const RATES = [rate('USD', '1.25'), rate('VND', '32500')];
const HOSTEL = { nightly_minor_low: 700, nightly_minor_high: 1_800, currency: 'USD' };

describe('a dollar amount for a crew settling in dong', () => {
  it('is converted and rounded as an estimate', () => {
    expect(inCrewCurrency(700, 'USD', 'VND', RATES)).toEqual({
      amountMinor: 182_000,
      currency: 'VND',
    });
    expect(inCrewCurrency(1_800, 'USD', 'VND', RATES)).toEqual({
      amountMinor: 468_000,
      currency: 'VND',
    });
  });

  it('keeps the sign of a fare difference', () => {
    expect(inCrewCurrency(-9_000, 'USD', 'VND', RATES)).toEqual({
      amountMinor: -2_340_000,
      currency: 'VND',
    });
  });

  it('stays as quoted, in dollars, while the device has no rate for it', () => {
    expect(inCrewCurrency(700, 'USD', 'VND', [rate('VND', '32500')])).toEqual({
      amountMinor: 700,
      currency: 'USD',
    });
    expect(inCrewCurrency(700, 'USD', 'VND', [])).toEqual({ amountMinor: 700, currency: 'USD' });
  });

  it('stays in dollars, rounded as an estimate, for a dollar crew or with no crew currency known', () => {
    expect(inCrewCurrency(123_456, 'USD', 'USD', RATES)).toEqual({
      amountMinor: 123_000,
      currency: 'USD',
    });
    expect(inCrewCurrency(700, 'USD', null, RATES)).toEqual({ amountMinor: 700, currency: 'USD' });
  });
});

describe('a stay’s nightly estimate', () => {
  const crew = (currency: string, rates: typeof RATES) => ({
    currency,
    convert: (minor: number, from: string) => inCrewCurrency(minor, from, currency, rates),
  });

  it('reads in dong for a dong crew and in dollars for a dollar crew', () => {
    expect(estimateOf('en', HOSTEL, crew('VND', RATES))).toEqual({
      text: '₫182,000–₫468,000',
      quotedIn: null,
    });
    expect(estimateOf('en', HOSTEL, crew('USD', RATES))).toEqual({
      text: '$7–$18',
      quotedIn: null,
    });
  });

  it('names the dollar for a dong crew whose device has no rate yet', () => {
    expect(estimateOf('en', HOSTEL, crew('VND', []))).toEqual({ text: '$7–$18', quotedIn: 'USD' });
  });
});
