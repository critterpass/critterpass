/**
 * Hold to befriend (8.03): a 108 ring around a 92 white centre reading "Hold". Before the critter
 * is ready the ring shows how long you have stayed; once ready, holding fills it (1.5 s, light ticks
 * at a third and two thirds, a success at the end) and letting go early springs it back (Smooth).
 * Screen readers get a plain button instead of the hold.
 */
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { SPRINGS, Text, usePremiumTheme } from '@/ui/premium';
import { HOLD_TRACK } from './scrims';

export const HOLD_MS = 1500;
const SIZE = 108;
const CENTRE = 92;
const STROKE = (SIZE - CENTRE) / 2;
const TICKS = [1 / 3, 2 / 3];

function tick(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export interface HoldRingProps {
  readonly label: string;
  /** What a screen reader's button says ("Befriend"). */
  readonly actionLabel: string;
  readonly ready: boolean;
  /** How far the stay is (0–1), shown while not ready. */
  readonly stay: number;
  /** The fill colour (mint; sun for a legendary). */
  readonly color: string;
  readonly onComplete: () => void;
  readonly testID?: string;
}

export function HoldRing({
  label,
  actionLabel,
  ready,
  stay,
  color,
  onComplete,
  testID,
}: HoldRingProps) {
  const t = usePremiumTheme();
  const hold = useSharedValue(0);
  const shown = ready ? hold : null;
  const track = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(SIZE / 2, SIZE / 2, SIZE / 2 - STROKE / 2);
    return p;
  }, []);
  const arc = useMemo(() => {
    const p = Skia.Path.Make();
    const r = SIZE / 2 - STROKE / 2;
    p.addArc({ x: STROKE / 2, y: STROKE / 2, width: r * 2, height: r * 2 }, -90, 359.9);
    return p;
  }, []);
  const end = useDerivedValue(() =>
    shown === null ? Math.max(0, Math.min(1, stay)) : shown.value,
  );

  useAnimatedReaction(
    () => hold.value,
    (now, before) => {
      if (before === null || now <= before) return;
      for (const mark of TICKS) if (before < mark && now >= mark) scheduleOnRN(tick);
    },
  );

  const complete = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete();
  };
  const start = () => {
    if (!ready) return;
    hold.set(
      withTiming(1, { duration: HOLD_MS * (1 - hold.get()), easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(complete);
      }),
    );
  };
  const release = () => {
    if (hold.get() >= 1) return;
    cancelAnimation(hold);
    hold.set(withSpring(0, SPRINGS.smooth));
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={actionLabel}
      accessibilityState={{ disabled: !ready }}
      accessibilityActions={[{ name: 'activate', label: actionLabel }]}
      onAccessibilityAction={() => ready && onComplete()}
      onPressIn={start}
      onPressOut={release}
      style={styles.ring}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={track} style="stroke" strokeWidth={STROKE} color={HOLD_TRACK} />
        <Path
          path={arc}
          style="stroke"
          strokeWidth={STROKE}
          strokeCap="round"
          color={color}
          start={0}
          end={end}
        />
      </Canvas>
      <View style={[styles.centre, { backgroundColor: t.color.card }]}>
        <Text variant="button">{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  centre: {
    width: CENTRE,
    height: CENTRE,
    borderRadius: CENTRE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
