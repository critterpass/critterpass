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
import { triggerImpact, useReducedImpactMotion } from './shared';

const flapEasing = bezierEasing(tokens.motion.easing.inOut);

// docs/design-system.md §3.4 `splitFlap`: "340 per flip". One position's flap: rotateX 0->90 (old
// character), swap, 90->0 (new character) — same 90deg-swap shape as `flap` (T3), at this duration.
const HALF_MS = 170;

export interface UseSplitFlapCharacterResult {
  readonly displayChar: string;
  readonly style: ReturnType<typeof useAnimatedStyle>;
}

/**
 * One character position on a split-flap board (departures, `sound.tokens.json`'s `flap` cue:
 * "split-flap clatter"). A caller renders one board position per character by calling this once per
 * list item (`value.split('').map((char, i) => <Position key={i} char={char} />)`), which keeps each
 * position's hook count fixed regardless of how the overall string's length changes.
 */
export function useSplitFlapCharacter(char: string): UseSplitFlapCharacterResult {
  const rotateX = useSharedValue(0);
  const reduced = useReducedImpactMotion();
  const [displayChar, setDisplayChar] = useState(char);
  const previousAnimatedChar = useRef(char);
  const [previousReducedChar, setPreviousReducedChar] = useState(char);

  // Reduced motion has no animation to wait for, so the swap is adjusted during render (react.dev
  // "You Might Not Need an Effect") rather than through an effect.
  if (reduced && previousReducedChar !== char) {
    setPreviousReducedChar(char);
    setDisplayChar(char);
  }

  useEffect(() => {
    if (reduced || previousAnimatedChar.current === char) return;
    previousAnimatedChar.current = char;
    rotateX.value = withSequence(
      withTiming(90, { duration: HALF_MS, easing: flapEasing }, (finished) => {
        'worklet';
        if (finished) {
          triggerImpact('flap');
          scheduleOnRN(setDisplayChar, char);
        }
      }),
      withTiming(0, { duration: HALF_MS, easing: flapEasing }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rotateX is a stable shared value ref.
  }, [char, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [{ perspective: 300 }, { rotateX: `${rotateX.value}deg` }],
  }));

  return { displayChar, style };
}
