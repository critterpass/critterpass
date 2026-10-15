/**
 * The idle loops the critter scenes use (float, hop, bob, ping ring, spinning rays) and the Lively
 * landing of a stamp or sticker. Reduce Motion: loops rest on their first frame and landings fade
 * in over 150 ms.
 */
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useIdleLoopRunning } from '@/motion/idle-pause';
import { REDUCED_FADE, SPRINGS, usePremiumReducedMotion } from '@/ui/premium';

const inOut = Easing.inOut(Easing.quad);

/** A 0→1→0 clock over `ms`, forever; still at 0 under Reduce Motion. */
function useCycle(ms: number, delayMs = 0) {
  const reduced = usePremiumReducedMotion();
  const looping = useIdleLoopRunning(!reduced);
  const p = useSharedValue(0);
  useEffect(() => {
    if (!looping) {
      cancelAnimation(p);
      p.value = 0;
      return undefined;
    }
    p.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: ms / 2, easing: inOut }),
          withTiming(0, { duration: ms / 2, easing: inOut }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(p);
  }, [looping, ms, delayMs, p]);
  return p;
}

interface LoopProps {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

/** Float: up 9 and a −2°→2° sway (critter detail, recap stickers). */
export function Float({ children, style, ms = 4200 }: LoopProps & { readonly ms?: number }) {
  const p = useCycle(ms);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: -9 * p.value }, { rotate: `${-2 + 4 * p.value}deg` }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Bob: up 6 and back (the guide waiting). */
export function Bob({ children, style, ms = 2400 }: LoopProps & { readonly ms?: number }) {
  const p = useCycle(ms);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * p.value }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Hop: squash .9, leap −14 stretched 1.05, land .94, rest (the encounter critter). */
export function Hop({ children, style, ms = 2800 }: LoopProps & { readonly ms?: number }) {
  const reduced = usePremiumReducedMotion();
  const looping = useIdleLoopRunning(!reduced);
  const p = useSharedValue(0);
  useEffect(() => {
    if (!looping) {
      cancelAnimation(p);
      p.value = 0;
      return undefined;
    }
    p.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1);
    return () => cancelAnimation(p);
  }, [looping, ms, p]);
  const animated = useAnimatedStyle(() => {
    const t = p.value;
    let ty = 0;
    let sy = 1;
    if (t < 0.1) sy = 1 - t;
    else if (t < 0.22) {
      const k = (t - 0.1) / 0.12;
      ty = -14 * k;
      sy = 0.9 + 0.15 * k;
    } else if (t < 0.34) {
      const k = (t - 0.22) / 0.12;
      ty = -14 * (1 - k);
      sy = 1.05 - 0.11 * k;
    } else if (t < 0.42) sy = 0.94 + 0.06 * ((t - 0.34) / 0.08);
    return { transform: [{ translateY: ty }, { scaleY: sy }] };
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** A ring that grows .6→1.5 and fades out, over `ms` (the encounter ping, the voice rings). */
export function Ping({
  style,
  ms = 2400,
  delayMs = 0,
}: {
  readonly style: StyleProp<ViewStyle>;
  readonly ms?: number;
  readonly delayMs?: number;
}) {
  const reduced = usePremiumReducedMotion();
  const looping = useIdleLoopRunning(!reduced);
  const p = useSharedValue(0);
  useEffect(() => {
    if (!looping) {
      cancelAnimation(p);
      p.value = 0;
      return undefined;
    }
    p.value = withDelay(
      delayMs,
      withRepeat(withTiming(1, { duration: ms, easing: Easing.out(Easing.quad) }), -1),
    );
    return () => cancelAnimation(p);
  }, [looping, ms, delayMs, p]);
  const animated = useAnimatedStyle(() =>
    reduced
      ? { opacity: 0.6 }
      : { opacity: 0.8 * (1 - p.value), transform: [{ scale: 0.6 + 0.9 * p.value }] },
  );
  return <Animated.View pointerEvents="none" style={[style, animated]} />;
}

/** Turns its child once every `ms` (the celebration rays); still under Reduce Motion. */
export function Spin({ children, style, ms }: LoopProps & { readonly ms: number }) {
  const reduced = usePremiumReducedMotion();
  const looping = useIdleLoopRunning(!reduced);
  const p = useSharedValue(0);
  useEffect(() => {
    if (!looping) {
      cancelAnimation(p);
      p.value = 0;
      return undefined;
    }
    p.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1);
    return () => cancelAnimation(p);
  }, [looping, ms, p]);
  const animated = useAnimatedStyle(() => ({ transform: [{ rotate: `${360 * p.value}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

/**
 * Lands its child on the Lively spring after `delayMs`: falls from scale `from` and a −30° tilt
 * (a stamp) or pops from .6 (a sticker). Reduce Motion fades it in.
 */
export function Land({
  children,
  style,
  delayMs = 0,
  from = 2.2,
  fall = 0,
}: LoopProps & { readonly delayMs?: number; readonly from?: number; readonly fall?: number }) {
  const reduced = usePremiumReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delayMs,
      reduced ? withTiming(1, REDUCED_FADE) : withSpring(1, SPRINGS.lively),
    );
  }, [reduced, delayMs, p]);
  const animated = useAnimatedStyle(() =>
    reduced
      ? { opacity: p.value }
      : {
          opacity: Math.min(1, p.value * 3),
          transform: [
            { translateY: fall * (1 - p.value) },
            { scale: from + (1 - from) * p.value },
            { rotate: `${-30 * (1 - p.value)}deg` },
          ],
        },
  );
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
