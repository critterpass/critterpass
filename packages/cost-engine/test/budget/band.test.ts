import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  bandStepMinor,
  computeBudgetBand,
  knobPosition,
  type BudgetBand,
  type BudgetBandInput,
} from '../../src/budget/band';
import { bucketDots, bucketWidth } from '../../src/budget/dots';
import { feasibleLow } from '../../src/budget/breakdown';
import { money, type Money } from '../../src/money/money';
import {
  BUDGET_TRACK,
  KYOTO_INDEX,
  PRIVATE_MAXES,
  USD,
  dollars,
} from '../golden/design-chain.fixture';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

const low = feasibleLow({ flights: dollars(520), nights: 7, days: 8, index: KYOTO_INDEX });
const STEP = 5_000n;

function band(maxes: readonly Money[], overrides: Partial<BudgetBandInput> = {}): BudgetBand {
  return computeBudgetBand({
    maxes,
    memberCount: 6,
    feasibleLow: low ?? dollars(0),
    stepMinor: STEP,
    track: BUDGET_TRACK,
    seed: 'trip-kyoto',
    ...overrides,
  });
}

describe('budget band golden', () => {
  it('feasible low is flights + cheapest nights + food + fun floor = $1,120', () => {
    expect(low).toEqual(dollars(1_120));
  });

  it('sweet spot $1,120–$1,350, under all six maxes, six anonymous dots', () => {
    const result = band(PRIVATE_MAXES);
    expect(result).toMatchObject({
      state: 'band',
      low: dollars(1_120),
      high: dollars(1_350),
      submitted: 6,
      of: 6,
      underAll: true,
    });
    expect(result.state === 'band' && result.dots?.length).toBe(6);
    expect(knobPosition(dollars(1_350), result)).toBe('in_band');
    expect(knobPosition(dollars(1_400), result)).toBe('above_band');
    expect(knobPosition(dollars(1_000), result)).toBe('below_band');
  });

  it('shows nothing crew-level below four maxes, then a band with dots', () => {
    expect(band(PRIVATE_MAXES.slice(0, 2))).toEqual({ state: 'waiting', submitted: 2, of: 6 });
    expect(band(PRIVATE_MAXES.slice(0, 3))).toEqual({ state: 'waiting', submitted: 3, of: 6 });
    expect(band(PRIVATE_MAXES.slice(0, 4))).toMatchObject({ state: 'band', underAll: false });
    expect(knobPosition(dollars(1), band([]))).toBe('no_band');
  });

  it('reports no sweet spot when the lowest max is under the feasible low', () => {
    expect(band([dollars(1_100), dollars(1_500), dollars(1_600), dollars(1_700)])).toMatchObject({
      state: 'no_sweet_spot',
      feasibleLow: dollars(1_120),
    });
    // $1,150 floors to $1,100 < $1,120: still no sweet spot.
    expect(band([dollars(1_150), dollars(1_500), dollars(1_600), dollars(1_700)]).state).toBe(
      'no_sweet_spot',
    );
  });

  it('never pins the lowest max: $1,420 and $1,400 both top out one step under', () => {
    const rest = [dollars(1_900), dollars(2_000), dollars(2_100)];
    expect(band([dollars(1_420), ...rest])).toMatchObject({ high: dollars(1_400) });
    expect(band([dollars(1_400), ...rest])).toMatchObject({ high: dollars(1_350) });
  });

  it('converts the $50 step through FX and rounds it up to two significant digits', () => {
    expect(bandStepMinor(USD)).toBe(5_000n);
    const fx = {
      snapshotId: 'fx',
      snapshots: [
        {
          base: 'EUR' as const,
          quote: 'USD' as const,
          rate: '1.08',
          asOf: '2027-02-01',
          source: 'f',
        },
        {
          base: 'EUR' as const,
          quote: 'SGD' as const,
          rate: '1.45',
          asOf: '2027-02-01',
          source: 'f',
        },
      ],
    };
    expect(bandStepMinor('SGD', fx)).toBe(6_800n);
  });

  it('rejects mixed currencies and a non-positive step', () => {
    expect(() => band([money(1n, 'SGD'), dollars(1), dollars(1), dollars(1)])).toThrow();
    expect(() => band(PRIVATE_MAXES, { stepMinor: 0n })).toThrow();
  });

  it('dot buckets are whole steps and (a, b] so a max on a step edge joins the band interval', () => {
    expect(bucketWidth(STEP, BUDGET_TRACK)).toBe(10_000n);
    expect(bucketWidth(STEP, { lowMinor: 0n, highMinor: 0n })).toBe(STEP);
    const onEdge = bucketDots([140_000n], STEP, BUDGET_TRACK, 's');
    const inside = bucketDots([135_001n], STEP, BUDGET_TRACK, 's');
    expect(onEdge).toEqual(inside);
  });
});

function bigintsIn(value: unknown, into: bigint[] = []): bigint[] {
  if (typeof value === 'bigint') into.push(value);
  else if (Array.isArray(value)) value.forEach((v) => bigintsIn(v, into));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => bigintsIn(v, into));
  return into;
}

const maxesArb = (min: number, max: number) =>
  fc.array(fc.integer({ min: 100_000, max: 300_000 }), { minLength: min, maxLength: max });

describe('budget privacy properties', PROPERTY_SUITE_OPTIONS, () => {
  it('output never contains an exact max unless it is the public feasible low', () => {
    fc.assert(
      fc.property(maxesArb(0, 8), (raw) => {
        const maxes = raw.map((v) => money(BigInt(v), USD));
        const out = band(maxes, { memberCount: 8 });
        const exposed = new Set(bigintsIn(out));
        exposed.delete(low?.amountMinor ?? -1n);
        for (const m of maxes) expect(exposed.has(m.amountMinor)).toBe(false);
      }),
    );
  });

  it('band high never equals the lowest max; k < 4 → nothing crew-level at all', () => {
    fc.assert(
      fc.property(maxesArb(0, 8), (raw) => {
        const maxes = raw.map((v) => money(BigInt(v), USD));
        const out = band(maxes, { memberCount: 8 });
        if (maxes.length < 4) {
          expect(out).toEqual({ state: 'waiting', submitted: maxes.length, of: 8 });
        }
        if (out.state === 'band') {
          const lowest = raw.reduce((a, b) => Math.min(a, b));
          expect(out.high.amountMinor).not.toBe(BigInt(lowest));
          expect(out.high.amountMinor < BigInt(lowest)).toBe(true);
        }
      }),
    );
  });

  it('for 4–5 maxes the lowest max is only known to within a full $50 step', () => {
    fc.assert(
      fc.property(maxesArb(4, 5), (raw) => {
        const maxes = raw.map((v) => BigInt(v));
        const out = band(
          maxes.map((v) => money(v, USD)),
          { memberCount: 4 },
        );
        if (out.state !== 'band') return;
        const lowest = maxes.reduce((a, b) => (a < b ? a : b));
        const at = maxes.indexOf(lowest);
        // Every lowest max in (high, high + step] gives the identical output.
        for (const candidate of [out.high.amountMinor + 1n, out.high.amountMinor + STEP]) {
          const moved = maxes.map((v, i) => (i === at ? candidate : v));
          expect(
            band(
              moved.map((v) => money(v, USD)),
              { memberCount: 4 },
            ),
          ).toEqual(out);
        }
      }),
    );
  });
});
