/**
 * The Help hero (3k-6): "← {GUIDE}", the share indicator "● CREW CAN SEE YOU · 1H" (blinking 1400
 * ms while the share runs), NEED A HAND?, where the traveller is and the guide's thinking sticker.
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
import { useMotionMode } from '@/motion';
import { HeroPanel } from '@/ui/cards/HeroPanel';
import { Row } from '@/ui/layout/Row';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface HelpHeroProps {
  readonly guideName: string;
  readonly guideSticker: { readonly kind: string; readonly name: string } | null;
  readonly placeLabel: string | null;
  /** Hours (rounded up) the crew can still see the traveller; null when not sharing. */
  readonly shareHours: number | null;
  readonly onBack: () => void;
}

const BLINK_MS = 1400;

const useStyles = makeStyles((t) => ({
  dot: { width: t.space['8'], height: t.space['8'], borderRadius: t.radius.pill },
  copy: { maxWidth: '68%' },
}));

function ShareIndicator({ hours }: { readonly hours: number }) {
  const { t } = useLingui();
  const theme = useTheme();
  const styles = useStyles();
  const locale = useLocale();
  const [motionMode] = useMotionMode();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (motionMode !== 'full') return undefined;
    opacity.value = withRepeat(withTiming(0.2, { duration: BLINK_MS / 2 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [motionMode, opacity]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const label = t({ id: 'safety.help.sharing', message: `Crew can see you · ${hours}h` });
  return (
    <Row gap="6" align="center" testID="help-share-indicator">
      <Animated.View style={[styles.dot, { backgroundColor: theme.color.ink['950'] }, dotStyle]} />
      <Text variant="label" color={theme.color.ink['950']}>
        {upper(label, locale)}
      </Text>
    </Row>
  );
}

export function HelpHero({
  guideName,
  guideSticker,
  placeLabel,
  shareHours,
  onBack,
}: HelpHeroProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const ink = theme.color.ink['950'];
  const where =
    placeLabel === null
      ? t({
          id: 'safety.help.whereUnknown',
          message: `${guideName} has the numbers and the words.`,
        })
      : t({
          id: 'safety.help.where',
          message: `You're on ${placeLabel}. ${guideName} has the numbers and the words.`,
        });
  return (
    <HeroPanel
      tone="pink"
      style={{ paddingTop: insets.top + theme.space['8'] }}
      sticker={
        guideSticker === null ? undefined : (
          <Sticker kind={guideSticker.kind} name={guideSticker.name} size={96} pose="think" />
        )
      }
      testID="help-hero"
    >
      <Stack gap="16">
        <Row justify="space-between" align="center">
          <BackEyebrow label={guideName} color={ink} onPress={onBack} testID="help-back" />
          {shareHours === null ? <View /> : <ShareIndicator hours={shareHours} />}
        </Row>
        <Text variant="displayHero" color={ink} accessibilityRole="header">
          {upper(t({ id: 'safety.help.title', message: 'Need a hand?' }), locale)}
        </Text>
        <View style={styles.copy}>
          <Text variant="body" color={ink} testID="help-where">
            {where}
          </Text>
        </View>
      </Stack>
    </HeroPanel>
  );
}
