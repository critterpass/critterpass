/**
 * The leave-by alarm as the app draws it (6.26), when the phone has no system alarm for it and the
 * app is open: ink with a tangerine glow, "LEAVE-BY ALARM · BATUR", the time huge, the pickup
 * line, the guide wobbling with its line in its own voice, "slide, I'm up →" and the one snooze
 * ("Tokek will sigh"); after it the screen says the crew was pinged. Reduce Motion stills it.
 */
import { premium } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CritterSticker, Text, TextButton, usePremiumReducedMotion } from '@/ui/premium';

import type { InAppAlarmProps } from '../../alarm/view-types';
import { guideCritterKind, guideCritterName } from '../components/guide-critter';
import { SlideToUp } from './SlideToUp';

const DARK = premium.modes.dark.color;
const GLOW =
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, not copy
  'radial-gradient(circle at 50% 36%, rgba(255,154,77,0.4) 0%, rgba(255,154,77,0) 60%)';
/** The wobble: four quick turns, then still for the rest of the loop. */
const WOBBLE_MS = 180;
const REST_MS = 1080;

function useWobble() {
  const reduced = usePremiumReducedMotion();
  const angle = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      angle.value = 0;
      return undefined;
    }
    angle.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: WOBBLE_MS }),
        withTiming(8, { duration: WOBBLE_MS }),
        withTiming(-8, { duration: WOBBLE_MS }),
        withTiming(8, { duration: WOBBLE_MS }),
        withTiming(0, { duration: WOBBLE_MS }),
        withTiming(0, { duration: REST_MS }),
      ),
      -1,
    );
    return () => cancelAnimation(angle);
  }, [reduced, angle]);
  return useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
}

export function InAppAlarmPremium(props: InAppAlarmProps) {
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const wobble = useWobble();
  const guideName = guideCritterName(props.guide);
  const white = DARK.ink;
  return (
    <View
      style={[styles.root, { backgroundColor: DARK.inkSurface }]}
      accessibilityViewIsModal
      testID={props.snoozeAllowed ? 'trip-alarm-ringing' : 'trip-alarm-final'}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundImage: GLOW }]} pointerEvents="none" />
      <View
        style={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.center}>
          <Text variant="label" color={white} style={styles.soft}>
            {props.eyebrow.toUpperCase()}
          </Text>
          <Text
            variant="hero"
            color={white}
            adjustsFontSizeToFit
            numberOfLines={1}
            style={styles.tabular}
          >
            {props.time}
          </Text>
          <Text variant="body" color={white} style={styles.soft} align="center">
            {props.subtitle}
          </Text>
        </View>
        <View style={styles.center}>
          <Animated.View style={wobble}>
            <CritterSticker
              kind={guideCritterKind(props.guide)}
              name={guideName}
              size={160}
              pose="cheer"
            />
          </Animated.View>
          <Text variant="guide" color={premium.accent.sun} align="center">
            {props.guideLine}
          </Text>
        </View>
        <View style={styles.foot}>
          <SlideToUp
            label={t({ id: 'trip.alarm.slide', message: "slide, I'm up →" })}
            actionLabel={t({ id: 'trip.alarm.imUp', message: "I'm up" })}
            onConfirm={props.onUp}
            testID="trip-alarm-slide"
          />
          {props.snoozeAllowed ? (
            <View style={styles.center}>
              <TextButton
                label={t({ id: 'trip.alarm.snooze', message: 'Snooze 5 min' })}
                color={white}
                onPress={props.onSnooze}
                testID="trip-alarm-snooze"
              />
              <Text variant="captionMuted" color={white} style={styles.faint}>
                {t({ id: 'trip.alarm.snoozeNote', message: `(${guideName} will sigh)` })}
              </Text>
            </View>
          ) : (
            <Text
              variant="rowText"
              color={white}
              align="center"
              style={styles.soft}
              testID="trip-alarm-pinged"
            >
              {t({
                id: 'trip.alarm.pingedLine',
                message: 'No more snoozes. The crew was pinged to give you a knock.',
              })}
            </Text>
          )}
          {props.onClose === undefined ? null : (
            <TextButton
              label={t({ id: 'trip.alarm.close', message: 'Close' })}
              color={white}
              onPress={props.onClose}
              testID="trip-alarm-close"
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: StyleSheet.absoluteFill,
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  center: { alignItems: 'center', gap: 6 },
  foot: { gap: 14, alignItems: 'center' },
  soft: { opacity: 0.8 },
  faint: { opacity: 0.6 },
  tabular: { fontVariant: ['tabular-nums'] },
});
