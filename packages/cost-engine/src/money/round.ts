/**
 * Rounding modes over exact bigint ratios. Every money computation that is not an exact integer
 * result — allocation remainders, FX conversion, percentage splits — goes through `divideRounded`
 * so the rounding rule is applied in one place, on exact integers, never on a floating-point
 * intermediate.
 */
import { DomainError } from '@cp/domain';

/**
 * `half_even` (banker's rounding) is the default for ledger values: it never biases a long run of
 * splits up or down. `half_up` matches how most people expect a single price to round. `up`/`down`
 * are ceiling/floor away from and toward zero, used for approximate quotes ("~$1,240 each" rounds
 * down to a clean number; a worst-case estimate rounds up).
 */
export const ROUNDING_MODES = ['half_even', 'half_up', 'up', 'down'] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

/**
 * Divides two bigints to the nearest integer per `mode`, using only integer arithmetic (no float
 * ever participates). `denominator` must be non-zero; sign is handled so `mode` behaves the same
 * regardless of which operand carries the negative sign.
 */
export function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator === 0n) {
    throw new DomainError('VALIDATION', { reason: 'division_by_zero' });
  }

  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;

  if (remainder === 0n) {
    return negative ? -quotient : quotient;
  }

  const roundedAbs = roundAbsolute(quotient, remainder, absDenominator, mode);
  return negative ? -roundedAbs : roundedAbs;
}

function roundAbsolute(
  quotient: bigint,
  remainder: bigint,
  denominator: bigint,
  mode: RoundingMode,
): bigint {
  switch (mode) {
    case 'down':
      return quotient;
    case 'up':
      return quotient + 1n;
    case 'half_up': {
      const twiceRemainder = remainder * 2n;
      return twiceRemainder >= denominator ? quotient + 1n : quotient;
    }
    case 'half_even': {
      const twiceRemainder = remainder * 2n;
      if (twiceRemainder > denominator) return quotient + 1n;
      if (twiceRemainder < denominator) return quotient;
      return quotient % 2n === 0n ? quotient : quotient + 1n;
    }
  }
}
