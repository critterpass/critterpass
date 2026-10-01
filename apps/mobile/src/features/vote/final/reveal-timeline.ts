/**
 * The winner reveal's entrance on one clock (3c-2), so every part keeps its moment: from 560 ms the
 * name stamps down (2.6× and −8° to .95, then rest; 480 ms in all) and lands with the thud, the
 * heavy haptic, the screen jolt and the confetti; the score follows at 950 ms, the tally at 1100 ms
 * and the rest of the screen after it. Reduced motion shows the finished screen at once (the
 * screen itself fades in) and keeps the thud and the haptic. A lab can hold the clock at a moment.
 */
import { useEffect, useRef } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { impact } from '@/motion';
import { bezierEasing, linearEasing } from '@/motion/easing';
import { triggerImpact, useReducedImpactMotion } from '@/motion/patterns/shared';
import { useScreenJolt } from '@/motion/patterns/thud';

const THUD = 'thud.heavy' as const;

/** When each part of the reveal starts, in milliseconds from the screen opening. */
export const REVEAL_MS = {
  stamp: 560,
  stampFor: 480,
  score: 950,
  tally: 1100,
  rest: 1250,
  end: 1600,
} as const;

/** The share of the stamp's time spent falling; the remainder settles from .95 to rest. */
const FALL_SHARE = 0.8;
const FALL_MS = REVEAL_MS.stampFor * FALL_SHARE;
const SETTLE_MS = REVEAL_MS.stampFor - FALL_MS;
/** The moment the stamp lands. */
export const LAND_MS = REVEAL_MS.stamp + FALL_MS;
const STAMP_FROM = { scale: 2.6, rotate: -8 } as const;
const STAMP_LANDS_AT = 0.95;
/** The falling stamp comes out of nothing over its first moments, not as a full-size flash. */
const STAMP_FADE_MS = 60;
const ENTER_MS = tokens.motion.duration.fast;
const ENTER_RISE = 14;

const slam = bezierEasing(tokens.motion.easing.slam);
const standard = bezierEasing(tokens.motion.easing.standard);

function enterAt(clock: number, at: number) {
  'worklet';
  const eased = standard(Math.min(1, Math.max(0, (clock - at) / ENTER_MS)));
  return { opacity: eased, transform: [{ translateY: (1 - eased) * ENTER_RISE }] };
}

function useEnter(clock: SharedValue<number>, at: number) {
  return useAnimatedStyle(() => enterAt(clock.value, at));
}

export interface RevealTimelineOptions {
  /** Shows the entrance stopped at this moment (a lab capture of the stamp mid-fall, the score). */
  readonly holdAt?: number | undefined;
  /** Runs once, in the frame the stamp lands (full motion only). */
  readonly onLand: () => void;
}

export function useRevealTimeline({ holdAt, onLand }: RevealTimelineOptions) {
  // The system's setting is known on the first frame; the app's own mode resolves a moment later.
  const systemReduced = useReducedMotion();
  const reduced = useReducedImpactMotion() || systemReduced;
  const clock = useSharedValue(holdAt ?? (reduced ? REVEAL_MS.end : 0));
  const { triggerScreenJolt } = useScreenJolt();
  const landed = useRef(false);
  const latest = useRef({ onLand, triggerScreenJolt });
  useEffect(() => {
    latest.current = { onLand, triggerScreenJolt };
  });
  const land = useRef(() => {
    if (landed.current) return;
    landed.current = true;
    latest.current.triggerScreenJolt();
    latest.current.onLand();
  }).current;

  useEffect(() => {
    if (holdAt !== undefined) {
      // A held moment is a still of the full entrance, whatever the motion setting: nothing lands.
      clock.value = holdAt;
      return;
    }
    if (reduced) {
      clock.value = REVEAL_MS.end;
      if (!landed.current) {
        landed.current = true;
        impact(THUD);
      }
      return;
    }
    const run = (to: number, from: number, then?: () => void) =>
      withTiming(to, { duration: to - from, easing: linearEasing }, (finished) => {
        'worklet';
        if (finished && then !== undefined) triggerImpact(THUD, then);
      });
    clock.value = 0;
    clock.value = withSequence(run(LAND_MS, 0, land), run(REVEAL_MS.end, LAND_MS));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the clock is a stable shared value.
  }, [reduced, holdAt]);

  const stamp = useAnimatedStyle(() => {
    const at = clock.value - REVEAL_MS.stamp;
    if (at < 0) {
      return {
        opacity: 0,
        transform: [{ scale: STAMP_FROM.scale }, { rotate: `${STAMP_FROM.rotate}deg` }],
      };
    }
    const fall = slam(Math.min(1, at / FALL_MS));
    const settle = standard(Math.min(1, Math.max(0, (at - FALL_MS) / SETTLE_MS)));
    const scale =
      at < FALL_MS
        ? STAMP_FROM.scale + (STAMP_LANDS_AT - STAMP_FROM.scale) * fall
        : STAMP_LANDS_AT + (1 - STAMP_LANDS_AT) * settle;
    return {
      opacity: Math.min(1, at / STAMP_FADE_MS),
      transform: [{ scale }, { rotate: `${STAMP_FROM.rotate * (1 - fall)}deg` }],
    };
  });
  const score = useEnter(clock, REVEAL_MS.score);
  const tally = useEnter(clock, REVEAL_MS.tally);
  const rest = useEnter(clock, REVEAL_MS.rest);
  return { stamp, score, tally, rest };
}
