/**
 * The guide's ghost block (3e-2): the suggested slot in its own lane, yellow, tilted 2°, pulsing
 * (1600 ms; still under reduced motion). Tapping it accepts: it fades (300 ms) while the original
 * springs into its place.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';

import { useLoop } from '@/motion/use-loop';
import { useLocale } from '@/lib/i18n/use-locale';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import { clock } from '../day/format';
import type { BlockFrame } from './timeline-block';

const FADE_MS = 300;

const useStyles = makeStyles((th) => ({
  frame: { position: 'absolute', padding: th.space['2'], zIndex: 5 },
  face: {
    flex: 1,
    borderRadius: th.radius.md + th.space['2'],
    paddingHorizontal: th.space['12'],
    paddingVertical: th.space['8'],
    backgroundColor: th.color.yellow,
    shadowColor: th.shadow.hard.color,
    shadowOffset: { width: 0, height: th.shadow.hard.offsetY },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
}));

export function GuideGhost({
  frame,
  title,
  start,
  detail,
  accepted,
  onAccept,
}: {
  readonly frame: BlockFrame;
  readonly title: string;
  readonly start: number;
  readonly detail: string;
  readonly accepted: boolean;
  readonly onAccept: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const pulse = useLoop('pulse', { active: !accepted });
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withTiming(accepted ? 0 : 1, { duration: FADE_MS });
  }, [accepted, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        styles.frame,
        { top: frame.top, left: frame.left, width: frame.width, height: frame.height },
        fade,
      ]}
      pointerEvents={accepted ? 'none' : 'auto'}
    >
      <Animated.View style={[{ flex: 1 }, pulse]}>
        <PressScale
          widthClass="medium"
          onPress={onAccept}
          accessibilityRole="button"
          accessibilityLabel={t({
            id: 'plan.timeline.ghostA11y',
            message: `Suggestion: ${title}, ${clock(locale, start)}. Accept`,
          })}
          style={[styles.face, { transform: [{ rotate: degrees(2) }] }]}
          testID="plan-guide-ghost"
        >
          <Text variant="title" color={theme.semantic.text.onAccent} numberOfLines={1}>
            {upper(title, locale)}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.onAccent} numberOfLines={1}>
            {detail}
          </Text>
        </PressScale>
      </Animated.View>
    </Animated.View>
  );
}

export const GHOST_ACCEPT = {
  durationMs: tokens.motion.duration.slow,
  /** 3e-2's "original springs to ghost": cubic-bezier(.3, 1.3, .5, 1). */
  bezier: [0.3, 1.3, 0.5, 1] as [number, number, number, number],
  reviewAfterMs: 1300,
};
