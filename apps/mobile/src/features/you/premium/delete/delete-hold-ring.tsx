/**
 * Hold to delete (9.09): a pink ring around a white disc reading "Hold to delete". Holding fills
 * the ring over 1.5 s (light ticks at a third and two thirds, a success at the end) and the disc
 * says "Keep holding"; letting go early springs it back (Smooth). With a screen reader on, a press
 * asks the two-choice alert instead, as the kit's hold pill does.
 */
import { Canvas, Path } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { SPRINGS, Text, usePremiumTheme } from '@/ui/premium';
import { HOLD_TO_CONFIRM_MS, confirmAlert, type TwoChoiceAlert } from '@/ui/premium/shell';

const SIZE = 156;
const STROKE = 9;
const GAP = 6;
const DISC = SIZE - (STROKE + GAP) * 2;
const TICKS = [1 / 3, 2 / 3] as const;
/** The ring as two half arcs from the top, clockwise, so the fill starts at twelve o'clock. */
const R = SIZE / 2 - STROKE / 2;
// eslint-disable-next-line lingui/no-unlocalized-strings -- an SVG path, never copy.
const RING = `M ${SIZE / 2} ${STROKE / 2} A ${R} ${R} 0 1 1 ${SIZE / 2} ${SIZE - STROKE / 2} A ${R} ${R} 0 1 1 ${SIZE / 2} ${STROKE / 2}`;

function tick(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export interface DeleteHoldRingProps {
  readonly label: string;
  readonly onConfirm: () => void;
  readonly fallback: TwoChoiceAlert;
  readonly disabled: boolean;
  readonly testID?: string;
}

export function DeleteHoldRing({
  label,
  onConfirm,
  fallback,
  disabled,
  testID,
}: DeleteHoldRingProps) {
  const th = usePremiumTheme();
  const { t, i18n } = useLingui();
  const progress = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => subscription.remove();
  }, []);

  useAnimatedReaction(
    () => progress.value,
    (now, before) => {
      if (before === null || now <= before) return;
      for (const mark of TICKS) if (before < mark && now >= mark) scheduleOnRN(tick);
    },
  );

  const complete = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHolding(false);
    onConfirm();
  };
  const start = () => {
    if (disabled) return;
    setHolding(true);
    progress.set(
      withTiming(
        1,
        { duration: HOLD_TO_CONFIRM_MS * (1 - progress.get()), easing: Easing.linear },
        (finished) => {
          if (finished) scheduleOnRN(complete);
        },
      ),
    );
  };
  const release = () => {
    if (progress.get() >= 1) return;
    setHolding(false);
    cancelAnimation(progress);
    progress.set(withSpring(0, SPRINGS.smooth));
  };
  const askInstead = () => {
    if (disabled) return;
    void confirmAlert(fallback).then((confirmed) => {
      if (confirmed) onConfirm();
    });
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      {...(screenReader ? { onPress: askInstead } : { onPressIn: start, onPressOut: release })}
      style={[styles.ring, { opacity: disabled ? 0.5 : 1 }]}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={RING} style="stroke" strokeWidth={STROKE} color={th.color.destructive.bg} />
        <Path
          path={RING}
          style="stroke"
          strokeWidth={STROKE}
          strokeCap="round"
          color={th.accent.pink}
          start={0}
          end={progress}
        />
      </Canvas>
      <View style={[styles.disc, { backgroundColor: th.color.card, boxShadow: th.shadow.card }]}>
        {holding ? (
          <Text variant="tier" color={th.color.destructive.text} align="center">
            {t({ id: 'you.delete.keepHolding', message: 'Keep holding' }).toLocaleUpperCase(
              i18n.locale,
            )}
          </Text>
        ) : null}
        <Text variant="headline" align="center" singleLine={false}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: SIZE,
    height: SIZE,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
