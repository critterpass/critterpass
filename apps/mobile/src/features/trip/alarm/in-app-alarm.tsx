/**
 * The leave-by alarm as the app draws it (5b-3) when this phone has no system alarm for it (no
 * alarm module in this build, or the permission refused) and the app is open at the time: night
 * background with a warm glow that pulses, the time, the pickup line, the guide hopping with its
 * line, SLIDE, I'M UP and one snooze. After that snooze the snooze control is gone and the screen
 * says the crew was pinged.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { GUIDE_STICKERS, type GuideAvatarId } from '@/ui/avatar/guides';
import { TextLink } from '@/ui/buttons/TextLink';
import { SlideToConfirm } from '@/ui/inputs/SlideToConfirm';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const STICKER = 150;
const GLOW = 440;

export interface InAppAlarmProps {
  readonly guide: GuideAvatarId;
  /** "Leave-by alarm · Batur". */
  readonly eyebrow: string;
  readonly time: string;
  readonly subtitle: string;
  readonly guideLine: string;
  /** The one snooze is still there; false after it (the crew was pinged instead). */
  readonly snoozeAllowed: boolean;
  readonly onUp: () => void;
  readonly onSnooze: () => void;
  readonly onClose?: () => void;
}

const useStyles = makeStyles((th) => ({
  root: { ...StyleSheet.absoluteFill, backgroundColor: th.color.ink['930'] },
  glow: {
    position: 'absolute',
    width: GLOW * 1.6,
    height: GLOW * 1.6,
    borderRadius: GLOW * 0.8,
    bottom: -GLOW * 0.95,
    alignSelf: 'center',
    backgroundColor: th.color.orange,
    opacity: 0.28,
  },
  content: { flex: 1, paddingHorizontal: th.size.gutter, justifyContent: 'space-between' },
  bubble: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['16'],
    paddingVertical: th.space['12'],
  },
}));

export function InAppAlarm(props: InAppAlarmProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const pulse = useLoop('pulse');
  const hop = useLoop('hop');
  const sticker = GUIDE_STICKERS[props.guide];
  const guideName = sticker.name;
  return (
    <View
      style={styles.root}
      accessibilityViewIsModal
      testID={props.snoozeAllowed ? 'trip-alarm-ringing' : 'trip-alarm-final'}
    >
      <Animated.View style={[styles.glow, pulse]} />
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + theme.space['32'] * 1.5, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <Stack gap="4" align="center">
          <Text variant="eyebrow" color={theme.color.orange}>
            {upper(props.eyebrow, locale)}
          </Text>
          <Text variant="displayMega" autoFit color={theme.semantic.text.primary}>
            {props.time}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {props.subtitle}
          </Text>
        </Stack>
        <Stack gap="16" align="center">
          <Animated.View style={hop}>
            <Sticker kind={sticker.kind} name={sticker.name} size={STICKER} pose="wave" />
          </Animated.View>
          <View style={styles.bubble}>
            <Text variant="voice" color={theme.color.yellow}>
              {props.guideLine}
            </Text>
          </View>
        </Stack>
        <Stack gap="12" align="center">
          <SlideToConfirm
            label={upper(t({ id: 'trip.alarm.slide', message: "Slide, I'm up" }), locale)}
            actionLabel={t({ id: 'trip.alarm.imUp', message: "I'm up" })}
            onConfirm={props.onUp}
            testID="trip-alarm-slide"
          />
          {props.snoozeAllowed ? (
            <Stack gap="2" align="center">
              <TextLink
                label={t({ id: 'trip.alarm.snooze', message: 'Snooze 5 min' })}
                onPress={props.onSnooze}
                testID="trip-alarm-snooze"
              />
              <Text variant="caption" color={theme.semantic.text.secondary}>
                {t({ id: 'trip.alarm.snoozeNote', message: `(${guideName} will sigh)` })}
              </Text>
            </Stack>
          ) : (
            <Text variant="bodySm" color={theme.semantic.text.secondary} testID="trip-alarm-pinged">
              {t({
                id: 'trip.alarm.pingedLine',
                message: 'No more snoozes. The crew was pinged to give you a knock.',
              })}
            </Text>
          )}
          {props.onClose === undefined ? null : (
            <TextLink
              label={t({ id: 'trip.alarm.close', message: 'Close' })}
              onPress={props.onClose}
              testID="trip-alarm-close"
            />
          )}
        </Stack>
      </View>
    </View>
  );
}
