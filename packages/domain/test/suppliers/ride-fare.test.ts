import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  estimateRideFare,
  RIDE_HAIL_PEAK_FACTOR,
  rideTariffSchema,
  type RideRate,
  type RideTariff,
} from '../../src/suppliers/ride-fare';

const source = [{ url: 'https://example.org/tariff', covers: 'all', checked_on: '2026-09-30' }];
const meter: RideRate = {
  base_fare: 500,
  included_km: 1,
  per_km: 400,
  later: null,
  per_min: 60,
  minimum_fare: null,
};

function tariff(overrides: Partial<RideTariff>): RideTariff {
  return rideTariffSchema.parse({
    id: 'kyoto:metered_taxi',
    destination: 'kyoto',
    ride_class: 'metered_taxi',
    operator: 'Kyoto taxi',
    currency: 'JPY',
    basis: 'meter_tariff',
    standard: meter,
    upper: null,
    time_charge: 'slow_traffic',
    extras: [],
    round_to: 10,
    sources: source,
    ...overrides,
  });
}

const rate = fc
  .record({
    base_fare: fc.integer({ min: 0, max: 20_000 }),
    included_km: fc.constantFrom(0, 0.9, 2, 4),
    per_km: fc.integer({ min: 0, max: 8_000 }),
    later: fc.option(fc.integer({ min: 0, max: 8_000 }), { nil: null }),
    per_min: fc.option(fc.integer({ min: 0, max: 800 }), { nil: null }),
    minimum_fare: fc.option(fc.integer({ min: 0, max: 40_000 }), { nil: null }),
  })
  .map((r): RideRate => ({
    ...r,
    later: r.later === null ? null : { from_km: r.included_km + 3, per_km: r.later },
  }));
const route = fc.record({
  distanceM: fc.integer({ min: 0, max: 120_000 }),
  minutes: fc.integer({ min: 0, max: 240 }),
});
const anyTariff = fc
  .record({
    ride_class: fc.constantFrom('metered_taxi', 'ride_hail_car', 'ride_hail_bike' as const),
    standard: rate,
    raise: fc.option(fc.integer({ min: 0, max: 3_000 }), { nil: null }),
    round_to: fc.constantFrom(0.5, 1, 5, 10, 100, 1000),
    time_charge: fc.constantFrom('whole_trip', 'slow_traffic' as const),
  })
  .map(({ ride_class, standard, raise, ...rest }) =>
    tariff({
      id: `bali:${ride_class}`,
      destination: 'bali',
      ride_class,
      currency: 'IDR',
      standard,
      basis: raise === null ? 'operator_rates' : 'regulated_band',
      upper:
        raise === null
          ? null
          : {
              ...standard,
              base_fare: standard.base_fare + raise,
              per_km: standard.per_km + raise,
              minimum_fare: standard.minimum_fare === null ? null : standard.minimum_fare + raise,
            },
      ...rest,
    }),
  );

/** The fare the standard rates charge for the route, unrounded. */
function exactFare(t: RideTariff, r: { distanceM: number; minutes: number }): number {
  const s = t.standard;
  const km = r.distanceM / 1000;
  const cut = s.later === null ? km : Math.min(km, s.later.from_km);
  const later = s.later === null ? 0 : s.later.per_km * Math.max(0, km - s.later.from_km);
  const time = t.time_charge === 'whole_trip' ? (s.per_min ?? 0) * r.minutes : 0;
  const charge = s.base_fare + s.per_km * Math.max(0, cut - s.included_km) + later + time;
  return Math.max(charge, s.minimum_fare ?? 0);
}

function isMultiple(value: number, of: number): boolean {
  const ratio = value / of;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

describe('estimateRideFare', { timeout: 60_000 }, () => {
  it('prices a meter: flag fall, distance beyond it, and slow-traffic time on the high end', () => {
    const range = estimateRideFare(tariff({}), { distanceM: 3_400, minutes: 12 });
    // 500 + 400 × 2.4 = 1460; the high end adds 60 × 12 minutes of possible crawling.
    expect(range).toMatchObject({ low: 1460, high: 2180, currency: 'JPY', peakFactor: null });
  });

  it('switches to the later distance rate past its threshold', () => {
    const tiered = tariff({
      currency: 'ISK',
      standard: {
        base_fare: 880,
        included_km: 0,
        per_km: 477,
        later: { from_km: 4, per_km: 364 },
        per_min: null,
        minimum_fare: null,
      },
      round_to: 100,
    });
    // 880 + 477 × 4 + 364 × 6 = 4972.
    expect(estimateRideFare(tiered, { distanceM: 10_000, minutes: 15 })).toMatchObject({
      low: 4900,
      high: 5000,
    });
  });

  it('applies the minimum fare and the peak allowance to ride-hail without upper rates', () => {
    const car = tariff({
      id: 'lisbon:ride_hail_car',
      destination: 'lisbon',
      ride_class: 'ride_hail_car',
      currency: 'EUR',
      basis: 'operator_rates',
      standard: {
        ...meter,
        base_fare: 1,
        included_km: 0,
        per_km: 0.5,
        per_min: 0.1,
        minimum_fare: 4,
      },
      time_charge: 'whole_trip',
      round_to: 0.5,
    });
    expect(estimateRideFare(car, { distanceM: 800, minutes: 3 })).toMatchObject({
      low: 4,
      high: 6,
      minimumApplied: true,
    });
    // 1 + 5 + 2.5 = 8.5; with the peak allowance 12.75 → 13.
    expect(estimateRideFare(car, { distanceM: 10_000, minutes: 25 })).toMatchObject({
      low: 8.5,
      high: 13,
      peakFactor: RIDE_HAIL_PEAK_FACTOR,
      minimumApplied: false,
    });
  });

  it('keeps both ends in whole local units, low at most high, and never a unit under the minimum', () => {
    fc.assert(
      fc.property(anyTariff, route, (t, r) => {
        const range = estimateRideFare(t, r);
        expect(range.high).toBeGreaterThanOrEqual(range.low);
        expect(range.low).toBeGreaterThan((t.standard.minimum_fare ?? 0) - t.round_to - 1e-9);
        expect(isMultiple(range.low, t.round_to)).toBe(true);
        expect(isMultiple(range.high, t.round_to)).toBe(true);
      }),
    );
  });

  it('never gets cheaper as the route gets longer or slower', () => {
    fc.assert(
      fc.property(anyTariff, route, route, (t, a, b) => {
        const s = estimateRideFare(t, {
          distanceM: Math.min(a.distanceM, b.distanceM),
          minutes: Math.min(a.minutes, b.minutes),
        });
        const l = estimateRideFare(t, {
          distanceM: Math.max(a.distanceM, b.distanceM),
          minutes: Math.max(a.minutes, b.minutes),
        });
        expect(l.low).toBeGreaterThanOrEqual(s.low);
        expect(l.high).toBeGreaterThanOrEqual(s.high);
      }),
    );
  });

  it('holds the standard tariff price for the route between its ends', () => {
    fc.assert(
      fc.property(anyTariff, route, (t, r) => {
        const range = estimateRideFare(t, r);
        const exact = exactFare(t, r);
        expect(range.low).toBeLessThanOrEqual(exact + 1e-6);
        expect(range.high).toBeGreaterThanOrEqual(exact - 1e-6);
      }),
    );
  });

  it('refuses a regulated band without upper rates and a key that does not match', () => {
    expect(() => tariff({ basis: 'regulated_band' })).toThrow();
    expect(() => tariff({ id: 'bali:metered_taxi' })).toThrow();
  });
});
