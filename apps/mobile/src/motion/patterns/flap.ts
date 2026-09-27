import { useEffect, useRef, useState } from 'react';
import { scheduleOnRN } from 'react-native-worklets';
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { useReducedImpactMotion } from './shared';

const flapEasing = bezierEasing(tokens.motion.easing.inOut);

// docs/design-system.md §3.4 `flap`: "rotateX 0->90->0, 340 inOut, text swaps at 170" (every label
// state change). No sound cue in §3.4 (the `flap` sound cue is the split-flap board, T4's `splitFlap`).
const HALF_MS = 170;

export interface UseFlapOptions<Value> {
  /** The label's current value; swapping in a new one plays the flap. */
  readonly value: Value;
}

export interface UseFlapResult<Value> {
  /** The value to render — lags `value` until the flap reaches its rotated-away midpoint. */
  readonly displayValue: Value;
  readonly style: ReturnType<typeof useAnimatedStyle>;
}

/**
 * Every label state change flips 90deg away, swaps its text at the midpoint, then flips back
 * (docs/design-system.md §3.4 choreography rule 4). Reduced motion: the value swaps instantly.
 */
export function useFlap<Value>({ value }: UseFlapOptions<Value>): UseFlapResult<Value> {
  const rotateX = useSharedValue(0);
  const reduced = useReducedImpactMotion();
  const [displayValue, setDisplayValue] = useState(value);
  const previousAnimatedValue = useRef(value);
  const [previousReducedValue, setPreviousReducedValue] = useState(value);

  // Reduced motion has no animation to wait for, so the swap is adjusted during render (react.dev
  // "You Might Not Need an Effect": React re-renders immediately with the new state before the
  // screen paints) rather than through an effect, which the "no external system, don't setState in
  // an effect" rule correctly flags for exactly this kind of prop-driven sync.
  if (reduced && !Object.is(previousReducedValue, value)) {
    setPreviousReducedValue(value);
    setDisplayValue(value);
  }

  useEffect(() => {
    if (reduced || Object.is(previousAnimatedValue.current, value)) return;
    previousAnimatedValue.current = value;
    rotateX.value = withSequence(
      withTiming(90, { duration: HALF_MS, easing: flapEasing }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(setDisplayValue, value);
      }),
      withTiming(0, { duration: HALF_MS, easing: flapEasing }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rotateX is a stable shared value ref.
  }, [value, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [{ perspective: 300 }, { rotateX: `${rotateX.value}deg` }],
  }));

  return { displayValue, style };
}
