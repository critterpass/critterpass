/** The budget model: nothing crew-level below four maxes, and bars that always sum to the target. */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { stepOf } from '../lock-step';
import {
  bandView,
  barsFor,
  currencySymbol,
  estimatesOf,
  money,
  snap,
  trackOf,
  type AggregateRow,
} from '../model';

const ROW: AggregateRow = {
  currency: 'USD',
  maxes_count: 3,
  member_count: 3,
  band_low_minor: 80_000,
  band_high_minor: 140_000,
  step_minor: 5_000,
  track_high_minor: 250_000,
  bucketed_dots: '[0.5,0.6,0.7]',
  under_all_ok: 1,
  infeasible: 1,
};

const SOURCE = {
  currency: 'USD',
  start_date: '2027-04-02',
  end_date: '2027-04-09',
  members: [{ uid: 'a', home: 'SFO' }],
  fares: [{ origin: 'SFO', price_minor: 52_000, currency: 'USD', days: [] }],
  indices: ['apartment', 'ryokan'].map((stay_type, i) => ({
    stay_type,
    nightly_low_minor: [3_500, 7_000][i] ?? 0,
    nightly_high_minor: [6_000, 8_500][i] ?? 0,
    food_pp_day_minor: 2_750,
    fun_pp_day_minor: 1_750,
    currency: 'USD',
  })),
  fx: [],
};

describe('bandView', () => {
  it('shows only the count below four maxes, whatever the row holds', () => {
    expect(bandView(ROW, 3)).toEqual({ kind: 'waiting', set: 3, of: 3 });
  });

  it('shows the band, dots and under-all from four maxes', () => {
    const view = bandView({ ...ROW, maxes_count: 6, member_count: 6, infeasible: 0 }, 6);
    expect(view).toMatchObject({ kind: 'band', lowMinor: 80_000, highMinor: 140_000 });
    expect(view.kind === 'band' ? view.dots : null).toEqual([0.5, 0.6, 0.7]);
  });
});

describe('barsFor', () => {
  it('splits $1,350 into the render’s bars and a two-plus-five stay mix', () => {
    const bars = barsFor(135_000, estimatesOf(SOURCE));
    expect(bars).toMatchObject({ flights: 52_000, stays: 47_000, food: 22_000, fun: 14_000 });
    expect(bars?.stayMix).toEqual(
      expect.arrayContaining([
        { type: 'apartment', nights: 5 },
        { type: 'ryokan', nights: 2 },
      ]),
    );
  });

  it('always sums to the target', () => {
    const estimates = estimatesOf(SOURCE);
    for (let target = 50_000; target <= 300_000; target += 5_000) {
      const bars = barsFor(target, estimates);
      expect(bars === null ? target : bars.flights + bars.stays + bars.food + bars.fun).toBe(
        target,
      );
    }
  });

  it('says nothing is priced when the destination has no cost index', () => {
    expect(barsFor(135_000, estimatesOf({ ...SOURCE, indices: [], fares: [] }))).toBeNull();
  });
});

describe('the knob', () => {
  it('snaps to the crew step inside the track', () => {
    const estimates = estimatesOf(SOURCE);
    const stepMinor = stepOf({
      adopted: null,
      server: null,
      currency: 'USD',
      estimates,
      bandAnswered: false,
    });
    expect(stepMinor).toBe(5_000);
    const track = trackOf(bandView(null, 3), estimates, stepMinor ?? 0);
    expect(snap(track.maxMinor + 99_999, track)).toBe(track.maxMinor);
    expect(snap(101_234, track) % 5_000).toBe(0);
  });
});

describe('budget amounts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes whole units in the currency symbol', () => {
    expect(money('en', 135_000, 'USD')).toBe('$1,350');
    expect(currencySymbol('en', 'USD')).toBe('$');
  });

  it('swaps the code for the symbol where the runtime has no narrow symbol (Hermes on iOS)', () => {
    const Real = Intl.NumberFormat;
    jest
      .spyOn(Intl, 'NumberFormat')
      .mockImplementation(
        ((locale?: string | string[], options?: Intl.NumberFormatOptions) =>
          new Real(
            locale,
            options?.currencyDisplay === 'narrowSymbol'
              ? { ...options, currencyDisplay: 'code' }
              : options,
          )) as unknown as typeof Intl.NumberFormat,
      );
    expect(money('en', 135_000, 'USD')).toBe('$1,350');
  });
});
