/**
 * The SOS hero (3k-10): "● SOS · 16:42" (the dot blinks every 900 ms until someone is coming),
 * "1.2 KM FROM YOU", the sender's avatar and "{NAME} NEEDS HELP", the guide's summary of what
 * happened (or the sender's words) and their latest message. The sender sees their own status.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { useIdleLoopRunning, useMotionMode } from '@/motion';
import { UserAvatar } from '@/ui/avatar/Avatar';
import { HeroPanel } from '@/ui/cards/HeroPanel';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { clockTime } from '../format';
import type { SosMessage } from './use-sos';
import type { SosModel } from './sos-model';
import { distanceIn } from '@/lib/i18n/formats';

const BLINK_MS = 900;

const useStyles = makeStyles((t) => ({
  dot: { width: t.space['8'], height: t.space['8'], borderRadius: t.radius.pill },
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '86%',
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['14'],
    paddingVertical: t.space['10'],
  },
}));

export interface SosHeroProps {
  readonly model: SosModel;
  readonly words: string;
  readonly message: SosMessage | null;
  readonly distanceM: number | null;
}

export function SosHero({ model, words, message, distanceM }: SosHeroProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const [motionMode] = useMotionMode();
  const ink = theme.color.ink['950'];
  const opacity = useSharedValue(1);
  const blink = useIdleLoopRunning(model.waiting && motionMode === 'full');
  useEffect(() => {
    if (!blink) {
      opacity.value = 1;
      return undefined;
    }
    opacity.value = withRepeat(withTiming(0.15, { duration: BLINK_MS / 2 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [blink, opacity]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const time = clockTime(model.openedAt, locale);
  const name = model.senderName;
  const eyebrow =
    model.role === 'sender'
      ? t({ id: 'safety.sos.sentAt', message: `SOS sent · ${time}` })
      : t({ id: 'safety.sos.at', message: `SOS · ${time}` });
  const away = distanceM === null ? null : distanceIn(distanceM);
  const km = away === null ? null : away.value.toFixed(1);
  const title =
    model.state === 'resolved'
      ? model.role === 'sender'
        ? t({ id: 'safety.sos.youSafeTitle', message: 'The crew knows you are OK' })
        : t({ id: 'safety.sos.safeTitle', message: `${name} is safe` })
      : model.role === 'sender'
        ? model.reachedNobody
          ? t({ id: 'safety.sos.youAlone', message: 'Nobody else got this' })
          : t({ id: 'safety.sos.youTitle', message: 'Your crew is on it' })
        : t({ id: 'safety.sos.title', message: `${name} needs help` });
  return (
    <HeroPanel tone="pink" style={{ paddingTop: insets.top + theme.space['8'] }} testID="sos-hero">
      <Stack gap="16">
        <Row justify="space-between" align="center">
          <Row gap="6" align="center">
            <Animated.View style={[styles.dot, { backgroundColor: ink }, dotStyle]} />
            <Text variant="label" color={ink}>
              {upper(eyebrow, locale)}
            </Text>
          </Row>
          {km === null || model.role === 'sender' ? (
            <View />
          ) : (
            <Text variant="label" color={ink} testID="sos-distance">
              {upper(
                away?.unit === 'mi'
                  ? t({ id: 'safety.sos.awayMiles', message: `${km} mi from you` })
                  : t({ id: 'safety.sos.away', message: `${km} km from you` }),
                locale,
              )}
            </Text>
          )}
        </Row>
        <Row gap="12" align="center">
          {model.role === 'sender' ? null : (
            <UserAvatar name={name} avatar={{ kind: 'initials' }} viewer="others" size="lg" />
          )}
          <Stack flex={1}>
            <Text variant="displayXl" color={ink} accessibilityRole="header">
              {upper(title, locale)}
            </Text>
          </Stack>
        </Row>
        {words === '' ? null : (
          <Text variant="body" color={ink} testID="sos-words">
            {words}
          </Text>
        )}
        {message === null ? null : (
          <Stack gap="6">
            <View style={[styles.bubble, { backgroundColor: ink }]}>
              <Text variant="body" color={theme.color.paper.base}>
                {message.body}
              </Text>
            </View>
            <Text variant="label" color={ink}>
              {upper(`${name} · ${clockTime(message.at, locale)}`, locale)}
            </Text>
          </Stack>
        )}
      </Stack>
    </HeroPanel>
  );
}
