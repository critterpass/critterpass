/**
 * The onboarding screens' own idle loops (design keyframes the shared presets don't cover: the
 * splash passport's 4200 ms bob, Tokek's head pop every 3600 ms, the quiz card's bob), sampled
 * from the shared clock like the presets and parked at rest under reduced motion.
 */
import { useIsFocused } from 'expo-router';
import { useAnimatedStyle } from 'react-native-reanimated';

import { useSharedClock } from '@/motion/clock';
import { useMotionMode } from '@/motion/motion-mode';
import { sampleLoopPreset, type LoopKeyframeStop, type LoopPresetDef } from '@/motion/presets';

export interface OnboardingLoop {
  readonly durationMs: number;
  readonly stops: readonly LoopKeyframeStop[];
}

/** 3a-1 passport: `0:r-4 ty0;.5:r-2 ty-6;1:r-4 ty0` over 4200 ms. */
export const PASSPORT_BOB: OnboardingLoop = {
  durationMs: 4200,
  stops: [
    { at: 0, r: -4, ty: 0 },
    { at: 0.5, r: -2, ty: -6 },
    { at: 1, r: -4, ty: 0 },
  ],
};

/** 3a-1 Tokek on the cover's top edge: `0:ty0;.4:ty0;.5:ty-10;.6:ty0;1:ty0` over 3600 ms. */
export const TOKEK_POP: OnboardingLoop = {
  durationMs: 3600,
  stops: [
    { at: 0, ty: 0 },
    { at: 0.4, ty: 0 },
    { at: 0.5, ty: -10 },
    { at: 0.6, ty: 0 },
    { at: 1, ty: 0 },
  ],
};

/** 3a-4 top card: `0:ty0 r0;.5:ty-6 r-1;1:ty0 r0` over 3000 ms. */
export const CARD_BOB: OnboardingLoop = {
  durationMs: 3000,
  stops: [
    { at: 0, ty: 0, r: 0 },
    { at: 0.5, ty: -6, r: -1 },
    { at: 1, ty: 0, r: 0 },
  ],
};

/** 3a-5 HOME stamp breathing: `0:r-8 s1;.5:r-6 s1.03;1:r-8 s1`. */
export const STAMP_BREATHE: OnboardingLoop = {
  durationMs: 3200,
  stops: [
    { at: 0, r: -8, sx: 1, sy: 1 },
    { at: 0.5, r: -6, sx: 1.03, sy: 1.03 },
    { at: 1, r: -8, sx: 1, sy: 1 },
  ],
};

export function useOnboardingLoop(loop: OnboardingLoop, offset = 0) {
  const clock = useSharedClock();
  const focused = useIsFocused();
  const [mode] = useMotionMode();
  // `sampleLoopPreset` only reads the timing and stops; the id is the shared presets' key.
  const def: LoopPresetDef = {
    id: 'bob',
    durationMs: loop.durationMs,
    easing: 'inOut',
    stops: loop.stops,
  };
  const rest = sampleLoopPreset(def, 0);
  return useAnimatedStyle(() => {
    const t =
      mode === 'full' && focused
        ? sampleLoopPreset(def, clock.value / def.durationMs + offset)
        : rest;
    return {
      opacity: t.o,
      transform: [
        { translateX: t.tx },
        { translateY: t.ty },
        { rotate: `${t.r}deg` },
        { scaleX: t.sx },
        { scaleY: t.sy },
      ],
    };
  });
}
