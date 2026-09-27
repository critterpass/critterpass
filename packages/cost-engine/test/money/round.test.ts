import { DomainError } from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { divideRounded, ROUNDING_MODES } from '../../src/money/round';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

describe('divideRounded: worked examples per mode', () => {
  it("half_even rounds a tie to the nearest even quotient (banker's rounding)", () => {
    expect(divideRounded(5n, 2n, 'half_even')).toBe(2n); // 2.5 -> 2 (even)
    expect(divideRounded(7n, 2n, 'half_even')).toBe(4n); // 3.5 -> 4 (even)
    expect(divideRounded(1n, 2n, 'half_even')).toBe(0n); // 0.5 -> 0 (even)
  });

  it('half_up rounds a tie away from zero', () => {
    expect(divideRounded(5n, 2n, 'half_up')).toBe(3n); // 2.5 -> 3
    expect(divideRounded(-5n, 2n, 'half_up')).toBe(-3n); // -2.5 -> -3
  });

  it('up always rounds away from zero for a non-exact ratio', () => {
    expect(divideRounded(5n, 2n, 'up')).toBe(3n); // 2.5 -> 3
    expect(divideRounded(4n, 3n, 'up')).toBe(2n); // 1.33 -> 2
    expect(divideRounded(-4n, 3n, 'up')).toBe(-2n); // -1.33 -> -2
  });

  it('down always truncates toward zero for a non-exact ratio', () => {
    expect(divideRounded(5n, 2n, 'down')).toBe(2n); // 2.5 -> 2
    expect(divideRounded(4n, 3n, 'down')).toBe(1n); // 1.33 -> 1
    expect(divideRounded(-4n, 3n, 'down')).toBe(-1n); // -1.33 -> -1
  });

  it('is sign-agnostic: the sign may live on either operand', () => {
    expect(divideRounded(7n, -2n, 'down')).toBe(divideRounded(-7n, 2n, 'down'));
    expect(divideRounded(7n, -2n, 'half_even')).toBe(divideRounded(-7n, 2n, 'half_even'));
  });

  it('rejects division by zero', () => {
    expect(() => divideRounded(1n, 0n, 'half_even')).toThrow(DomainError);
  });
});

describe(
  'property: exact division is idempotent for every mode (10k cases)',
  PROPERTY_SUITE_OPTIONS,
  () => {
    it('a whole-number ratio rounds to itself regardless of mode', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: -1_000_000n, max: 1_000_000n }),
          fc.bigInt({ min: 1n, max: 1_000n }),
          fc.constantFrom(...ROUNDING_MODES),
          (multiplier, denominator, mode) =>
            divideRounded(multiplier * denominator, denominator, mode) === multiplier,
        ),
        { numRuns: 10_000 },
      );
    });
  },
);

describe(
  'property: every mode stays within one unit of the exact ratio (10k cases)',
  PROPERTY_SUITE_OPTIONS,
  () => {
    it('|rounded - numerator/denominator| < 1', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: -1_000_000_000n, max: 1_000_000_000n }),
          fc.bigInt({ min: 1n, max: 1_000_000n }).filter((n) => n !== 0n),
          fc.constantFrom(...ROUNDING_MODES),
          (numerator, denominator, mode) => {
            const rounded = divideRounded(numerator, denominator, mode);
            // exact*denominator == numerator; compare rounded*denominator against numerator directly
            // to stay in integer arithmetic (no float ever enters the check).
            const diff = rounded * denominator - numerator;
            const absDiff = diff < 0n ? -diff : diff;
            return absDiff < (denominator < 0n ? -denominator : denominator);
          },
        ),
        { numRuns: 10_000 },
      );
    });

    it('half_even and half_up only ever differ from down/up by at most one unit, all four bracket the exact value', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: -1_000_000_000n, max: 1_000_000_000n }),
          fc.bigInt({ min: 1n, max: 1_000_000n }),
          (numerator, denominator) => {
            const down = divideRounded(numerator, denominator, 'down');
            const up = divideRounded(numerator, denominator, 'up');
            const halfUp = divideRounded(numerator, denominator, 'half_up');
            const halfEven = divideRounded(numerator, denominator, 'half_even');
            const lo = down < up ? down : up;
            const hi = down < up ? up : down;
            return (
              halfUp >= lo && halfUp <= hi && halfEven >= lo && halfEven <= hi && hi - lo <= 1n
            );
          },
        ),
        { numRuns: 10_000 },
      );
    });
  },
);
