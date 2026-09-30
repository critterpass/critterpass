/**
 * The launch hatch overlays. `FirstHatch` plays the full hatch once, on the first launch, over the
 * welcome screen. `LaunchHatch` sits at the app root: it tells both hatches when the native launch
 * screen has gone and, on every later cold start, plays the short "Tokek waves" beat over whatever
 * screen opened. Neither ever takes a touch or delays navigation: they are pictures on top of a
 * live app, and unmount once faded. Reduce Motion shows the settled frame and fades.
 */
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { linearEasing } from '@/motion/easing';
import { feedback } from '@/motion/feedback';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { HatchStage } from './HatchStage';
import {
  finishLaunchHatch,
  launchHatchPending,
  markSplashRevealed,
  useSplashRevealed,
} from './launch-state';
import {
  BEAT_PLAN,
  BEAT_REDUCED_PLAN,
  BURST_MS,
  FIRST_REDUCED_PLAN,
  firstHatchPlan,
  settleMs,
  type HatchPlan,
} from './timeline';

interface HatchOverlayProps {
  readonly plan: HatchPlan;
  readonly onDone: () => void;
  /** The egg cracks audibly as it bursts (the first launch only). */
  readonly crack?: boolean;
  readonly testID: string;
}

function HatchOverlay({ plan, onDone, crack = false, testID }: HatchOverlayProps) {
  const revealed = useSplashRevealed();
  const clock = useSharedValue(plan.from);
  const fade = useSharedValue(1);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!revealed) return undefined;
    const settle = setTimeout(() => setStarted(true), settleMs(Platform.OS));
    return () => clearTimeout(settle);
  }, [revealed]);

  useEffect(() => {
    if (!started) return undefined;
    clock.value = withTiming(plan.to, { duration: plan.playMs, easing: linearEasing });
    fade.value = withDelay(plan.playMs + plan.holdMs, withTiming(0, { duration: plan.fadeMs }));
    // Unmounts on the JS clock once the fade is over; an overlay gone early cancels it.
    const end = setTimeout(onDone, plan.playMs + plan.holdMs + plan.fadeMs);
    const crackAt = ((BURST_MS - plan.from) / (plan.to - plan.from || 1)) * plan.playMs;
    const crackTimer =
      crack && crackAt >= 0 ? setTimeout(() => feedback.emit('crack'), crackAt) : null;
    return () => {
      clearTimeout(end);
      if (crackTimer !== null) clearTimeout(crackTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per start; the plan is fixed.
  }, [started]);

  const style = useAnimatedStyle(() => ({ opacity: fade.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <HatchStage clock={clock} full={started || settleMs(Platform.OS) === 0} testID={testID} />
    </Animated.View>
  );
}

/** The full hatch on the welcome screen, once, on the first launch; `onDone` when it has faded. */
export function FirstHatch({ onDone }: { readonly onDone: () => void }) {
  const reduced = useReducedImpactMotion();
  const plan = reduced ? FIRST_REDUCED_PLAN : firstHatchPlan(Platform.OS);
  const finish = () => {
    finishLaunchHatch('full');
    onDone();
  };
  return <HatchOverlay plan={plan} onDone={finish} crack={!reduced} testID="launch-hatch-full" />;
}

/** Whether the welcome screen opens on the full hatch: the first launch, until it has played. */
export const firstHatchPending = () => launchHatchPending('full');

export interface LaunchHatchProps {
  /** True once the root layout hides the native launch screen. */
  readonly revealed: boolean;
}

/** Mounted once at the app root, beside the other overlay hosts. */
export function LaunchHatch({ revealed }: LaunchHatchProps) {
  const reduced = useReducedImpactMotion();
  const [playing, setPlaying] = useState(() => launchHatchPending('beat'));
  useEffect(() => {
    if (revealed) markSplashRevealed();
  }, [revealed]);
  if (!playing) return null;
  return (
    <HatchOverlay
      plan={reduced ? BEAT_REDUCED_PLAN : BEAT_PLAN}
      onDone={() => {
        finishLaunchHatch('beat');
        setPlaying(false);
      }}
      testID="launch-hatch-beat"
    />
  );
}
