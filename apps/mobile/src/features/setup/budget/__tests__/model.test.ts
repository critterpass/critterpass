/** The budget model: nothing crew-level below four maxes, and bars that always sum to the target. */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { stepOf } from '../lock-step';
import {
  bandView,
  barsFor,
  currencySymbol,
  estimatesOf,
  initialTarget,
  isUnpriced,
  money,
  moneyAffixes,
  snap,
  trackOf,
  typedAmountMinor,
  widenTrack,
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

  it('splits the whole target over stay, food and fun when no flight is priced', () => {
    const estimates = estimatesOf({ ...SOURCE, fares: [] });
    const bars = barsFor(100_000, estimates);
    expect(bars).toMatchObject({ flights: 0, flightsPriced: false });
    expect((bars?.stays ?? 0) + (bars?.food ?? 0) + (bars?.fun ?? 0)).toBe(100_000);
    expect(barsFor(135_000, estimatesOf(SOURCE))?.flightsPriced).toBe(true);
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

describe('the track with no flight priced', () => {
  it('starts at the ground part (stay, food and fun), not at zero', () => {
    const estimates = estimatesOf({ ...SOURCE, fares: [] });
    const track = trackOf(bandView(null, 3), estimates, 5_000);
    // 7 nights × $35 + 8 days × ($27.50 + $17.50) = $605, on the $50 step below it.
    expect(track.minMinor).toBe(60_000);
    expect(track.maxMinor).toBe(150_000);
    expect(initialTarget(bandView(null, 3), track, null)).toBe(90_000);
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

describe('one way of writing an amount per locale', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the short symbol where the runtime writes the long one for Vietnamese', () => {
    const Real = Intl.NumberFormat;
    jest
      .spyOn(Intl, 'NumberFormat')
      .mockImplementation(
        ((locale?: string | string[], options?: Intl.NumberFormatOptions) =>
          new Real(
            locale,
            options?.currencyDisplay === 'narrowSymbol'
              ? { ...options, currencyDisplay: 'symbol' }
              : options,
          )) as unknown as typeof Intl.NumberFormat,
      );
    expect(money('vi', 80_000, 'USD').replace(/\s/gu, ' ')).toBe('800 $');
  });

  it('gives the rolling total the same symbol side as the written amounts', () => {
    expect(moneyAffixes('en', 'USD')).toEqual({ prefix: '$', suffix: '' });
    const vi = moneyAffixes('vi', 'USD');
    expect(vi.prefix).toBe('');
    expect(vi.suffix.trim()).toBe('$');
    expect(`${vi.prefix}1.350${vi.suffix}`).toBe(money('vi', 135_000, 'USD'));
  });
});

describe('the track with nothing priced', () => {
  const waiting = bandView(null, 1);
  const STEP_VND = 500_000;

  it('is sized from the trip’s length in the crew’s own step, never from zero', () => {
    const track = trackOf(waiting, null, STEP_VND, 4);
    expect(track).toEqual({ minMinor: 500_000, maxMinor: 12_000_000, stepMinor: STEP_VND });
    expect(initialTarget(waiting, track, null, 4)).toBe(4_000_000);
    expect(isUnpriced(waiting, null)).toBe(true);
  });

  it('assumes three days before the dates are locked', () => {
    expect(trackOf(waiting, null, STEP_VND, null).maxMinor).toBe(9_000_000);
  });

  it('leaves a priced trip’s track alone', () => {
    const estimates = estimatesOf({ ...SOURCE, fares: [] });
    expect(isUnpriced(waiting, estimates)).toBe(false);
    expect(trackOf(waiting, estimates, 5_000, 4).maxMinor).toBe(150_000);
  });
});

describe('a typed amount', () => {
  it('reads whole units however the reader groups them', () => {
    expect(typedAmountMinor('4.000.000', 'VND')).toBe(4_000_000);
    expect(typedAmountMinor('4,000,000 ₫', 'VND')).toBe(4_000_000);
    expect(typedAmountMinor('1,350.50', 'USD')).toBe(135_000);
    expect(typedAmountMinor('1350', 'USD')).toBe(135_000);
    expect(typedAmountMinor('', 'VND')).toBeNull();
    expect(typedAmountMinor('0', 'VND')).toBeNull();
  });

  it('stretches the track when no band limits it, and snaps onto the step', () => {
    const waiting = bandView(null, 1);
    const track = trackOf(waiting, null, 500_000, 4);
    const wide = widenTrack(track, waiting, 20_250_000);
    expect(wide.maxMinor).toBe(20_500_000);
    expect(snap(20_250_000, wide)).toBe(20_500_000);
    expect(snap(1, wide)).toBe(500_000);
  });

  it('never stretches past the crew’s band', () => {
    const band = bandView({ ...ROW, maxes_count: 6, member_count: 6, infeasible: 0 }, 6);
    const track = trackOf(band, null, 5_000);
    expect(widenTrack(track, band, 999_999_999)).toBe(track);
  });
});
