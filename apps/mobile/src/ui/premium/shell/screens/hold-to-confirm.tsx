import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { SPRINGS, Text, usePremiumTheme } from '../..';
import { useShellExtras } from '../shell-theme';
import { confirmAlert, type TwoChoiceAlert } from './alerts';

/** 4.55: the fill runs linearly over 1.5 s. */
export const HOLD_TO_CONFIRM_MS = 1500;
/** Light ticks as the fill passes a third and two thirds. */
const TICKS = [1 / 3, 2 / 3] as const;

export interface HoldToConfirmProps {
  /** The pill's words ("Hold to cancel Kyoto"). */
  readonly label: string;
  /** Runs once the fill completes. */
  readonly onConfirm: () => void;
  /** Screen readers and Switch Control can't hold: they get this two-choice alert instead. */
  readonly fallback: TwoChoiceAlert;
  readonly disabled?: boolean;
  readonly testID?: string;
}

function tick(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * The irreversible confirm (foundations-spec §1, 4.55): a pink pill whose fill grows from the left
 * while it is held, 1.5 s linear, with light ticks at a third and two thirds and a success at the
 * end. Letting go early retracts it (Smooth, no haptic). The fill shows under Reduce Motion too:
 * it is information, not decoration. With a screen reader on, a press asks the two-choice alert.
 */
export function HoldToConfirm({
  label,
  onConfirm,
  fallback,
  disabled = false,
  testID,
}: HoldToConfirmProps) {
  const t = usePremiumTheme();
  const extras = useShellExtras();
  const progress = useSharedValue(0);
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
      for (const mark of TICKS) {
        if (before < mark && now >= mark) scheduleOnRN(tick);
      }
    },
  );

  const complete = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
  };
  const start = () => {
    if (disabled) return;
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
    cancelAnimation(progress);
    progress.set(withSpring(0, SPRINGS.smooth));
  };
  const askInstead = () => {
    if (disabled) return;
    void confirmAlert(fallback).then((confirmed) => {
      if (confirmed) onConfirm();
    });
  };

  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      {...(screenReader ? { onPress: askInstead } : { onPressIn: start, onPressOut: release })}
    >
      <View
        style={[
          styles.pill,
          {
            height: t.size.button,
            borderRadius: t.radius.button,
            backgroundColor: t.color.destructive.bg,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Animated.View
          style={[styles.fill, { backgroundColor: extras.holdFill, transformOrigin: 'left' }, fill]}
        />
        <Text variant="button" color={t.color.destructive.text} style={styles.label}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fill: { ...StyleSheet.absoluteFillObject },
  label: { fontWeight: '700' },
});
