/**
 * The scan line over the receipt photo: a green line with its glow sweeps top to bottom (3.2 s)
 * and each recognised line lights up yellow as the sweep passes it. On a bad read it sweeps twice
 * and stutters at the fold; the total can stay locked in yellow while unreadable lines grey out.
 * Reduced motion: no sweep, the highlights simply show.
 */
import { tokens } from '@cp/design-tokens';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useScreenActive } from '@/lib/time/use-screen-active';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { makeStyles, useTheme } from '@/ui/theme';

/** The design's sweep: 3200 ms top to bottom. */
export const SWEEP_MS = 3200;
/** Where the stuttering sweep catches (a fold across the middle of the paper). */
const FOLD_AT = 0.55;

export interface SweepLine {
  readonly id: string;
  /** [x, y, w, h], 0 to 1 of the photo. */
  readonly box: readonly [number, number, number, number];
  readonly tone: 'read' | 'locked' | 'grey';
}

const useStyles = makeStyles((t) => ({
  sweep: {
    position: 'absolute',
    start: 0,
    end: 0,
    height: t.space['4'] - 1,
    backgroundColor: t.semantic.state.success,
    shadowColor: t.semantic.state.success,
    shadowOpacity: 0.9,
    shadowRadius: t.space['12'],
    shadowOffset: { width: 0, height: 0 },
    elevation: t.space['8'],
  },
  box: { position: 'absolute', borderRadius: t.radius.xs },
}));

function Highlight({
  line,
  progress,
  reduced,
}: {
  readonly line: SweepLine;
  readonly progress: SharedValue<number>;
  readonly reduced: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const [x, y, w, h] = line.box;
  const colour =
    line.tone === 'grey' ? theme.semantic.text.tertiary : theme.semantic.action.primary;
  const style = useAnimatedStyle(() => ({
    opacity: reduced || line.tone !== 'read' || progress.value >= y ? 0.55 : 0,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.box,
        {
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: `${w * 100}%`,
          height: `${h * 100}%`,
          backgroundColor: colour,
        },
        style,
      ]}
    />
  );
}

export function ScanSweep({
  lines,
  sweeping,
  stutter = false,
  children,
  testID,
}: {
  readonly lines: readonly SweepLine[];
  readonly sweeping: boolean;
  readonly stutter?: boolean;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const styles = useStyles();
  const reduced = useReducedImpactMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  // The line sweeps only while the scan is the screen in front.
  const visible = useScreenActive();
  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return undefined;
    }
    if (!sweeping || !visible) return undefined;
    const linear = { duration: SWEEP_MS, easing: Easing.linear };
    progress.value = 0;
    progress.value = stutter
      ? withSequence(
          withTiming(FOLD_AT, { duration: SWEEP_MS * FOLD_AT, easing: Easing.linear }),
          withTiming(FOLD_AT - 0.04, { duration: SWEEP_MS / 16 }),
          withTiming(1, { duration: SWEEP_MS * (1 - FOLD_AT), easing: Easing.linear }),
          withTiming(0, { duration: tokens.motion.duration.instant }),
          withTiming(1, linear),
        )
      : withRepeat(withTiming(1, linear), -1, false);
    return () => cancelAnimation(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress is a stable shared value.
  }, [sweeping, stutter, reduced, visible]);
  const sweepStyle = useAnimatedStyle(() => ({
    top: `${progress.value * 100}%`,
    opacity: sweeping && !reduced ? 1 : 0,
  }));
  return (
    <View testID={testID}>
      {children}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {lines.map((line) => (
          <Highlight key={line.id} line={line} progress={progress} reduced={reduced} />
        ))}
        <Animated.View style={[styles.sweep, sweepStyle]} />
      </View>
    </View>
  );
}
