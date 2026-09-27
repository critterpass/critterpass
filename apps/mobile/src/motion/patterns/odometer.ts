import { useEffect, useState } from 'react';
import { makeMutable, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { triggerImpact, useReducedImpactMotion } from './shared';

const rollEasing = bezierEasing(tokens.motion.easing.standard);

// docs/design-system.md §3.4 `odometer`: "per-digit rolling columns, 650 enter" + T4's own step 1:
// "digit stagger 30 ... tick cue throttled".
const ROLL_MS = 650;
const DIGIT_STAGGER_MS = 30;
// Ticking every column on a many-digit number would buzz; the least-significant (most visibly
// spinning) columns get the haptic, further ones settle silently.
const MAX_TICKING_COLUMNS = 4;

export interface OdometerColumn {
  readonly key: string;
  /** `true` for the leading sign column; its `value` is meaningless (renderers show a static "-"). */
  readonly isSign: boolean;
  /** A continuous digit value: renderers take `floor`/`frac` of it for the rolling strip. */
  readonly value: SharedValue<number>;
}

function digitsOf(value: number): {
  readonly negative: boolean;
  readonly digits: readonly number[];
} {
  const negative = value < 0;
  const digits = Math.abs(Math.trunc(value)).toString().split('').map(Number);
  return { negative, digits: digits.length > 0 ? digits : [0] };
}

/**
 * Per-digit rolling columns (docs/design-system.md §3.4 `odometer`), so a number never jumps
 * (choreography rule 6) even across a digit-count change (99 -> 100) or a sign change. Each column
 * animates independently, staggered 30ms apart from the ones place outward; a newly-appearing
 * higher-order column rolls in from 0 rather than snapping in. Reduced motion: every column jumps
 * straight to its settled value, no roll, no tick haptic. Column shared values are created with
 * `makeMutable` (not the `useSharedValue` hook) because their count changes with the number of
 * digits, and hooks cannot be called a variable number of times; the sign column's own shared value
 * is kept in its own piece of state (rather than nested in the digit-columns state) since it is
 * mutated directly and never needs to trigger a re-render on its own.
 */
export function useOdometer(value: number): { readonly columns: readonly OdometerColumn[] } {
  const reduced = useReducedImpactMotion();
  const [signColumn] = useState(() => makeMutable(0));
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [{ negative, digitColumns }, setStructure] = useState(() => {
    const parsed = digitsOf(value);
    return {
      negative: parsed.negative,
      digitColumns: parsed.digits
        .slice()
        .reverse()
        .map(() => makeMutable(0)),
    };
  });

  // Grows/shrinks the column array during render, before Reanimated's own effect below runs
  // (react.dev "Adjusting state when a prop changes"): a structural change to how many columns
  // exist, not a side effect that needs synchronizing with an external system.
  if (previousValue !== value) {
    setPreviousValue(value);
    const parsed = digitsOf(value);
    const reconciled = parsed.digits
      .slice()
      .reverse()
      .map((_digit, indexFromRight) => digitColumns[indexFromRight] ?? makeMutable(0));
    setStructure({ negative: parsed.negative, digitColumns: reconciled });
  }

  useEffect(() => {
    const { negative: targetNegative, digits } = digitsOf(value);
    digits.forEach((digit, indexFromLeft) => {
      const indexFromRight = digits.length - 1 - indexFromLeft;
      const column = digitColumns[indexFromRight];
      if (!column) return;
      if (reduced) {
        column.value = digit;
        return;
      }
      const delay = indexFromRight * DIGIT_STAGGER_MS;
      column.value = withDelay(
        delay,
        withTiming(digit, { duration: ROLL_MS, easing: rollEasing }, (finished) => {
          'worklet';
          if (finished && indexFromRight < MAX_TICKING_COLUMNS) triggerImpact('tick');
        }),
      );
    });

    // eslint-disable-next-line react-hooks/immutability -- a Reanimated shared value's `.value` setter, not React state.
    signColumn.value = reduced
      ? targetNegative
        ? 1
        : 0
      : withTiming(targetNegative ? 1 : 0, { duration: ROLL_MS, easing: rollEasing });
  }, [value, reduced, digitColumns, signColumn]);

  const columns: OdometerColumn[] = digitColumns
    .map((column, indexFromRight) => ({
      key: `digit${indexFromRight}`,
      isSign: false as const,
      value: column,
    }))
    .reverse();

  if (negative) {
    columns.unshift({ key: 'sign', isSign: true, value: signColumn });
  }

  return { columns };
}
