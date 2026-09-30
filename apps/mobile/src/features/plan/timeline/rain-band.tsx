/**
 * The rain band (3e-2): a dotted blue overlay across the day where rain is forecast, labelled
 * RAIN, drifting gently (ty 0 → 8 → 0 over 6 s) and gliding to a new window when the forecast
 * updates. Still under reduced motion; screen readers hear the window once.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';

import { bezierEasing, isPhysicalSpring, springConfig } from '@/motion';
import { useLocale } from '@/lib/i18n/use-locale';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { makeStyles, useTheme } from '@/ui/theme';

import { clockRange } from '../day/format';
import { AXIS_GUTTER, PT_PER_MINUTE, yOf, type Axis } from './geometry';

const DRIFT_PT = 8;
const DRIFT_HALF_MS = 3000;
const IN_OUT = bezierEasing(tokens.motion.easing.inOut);
const SOFT = isPhysicalSpring(tokens.motion.spring.soft)
  ? springConfig(tokens.motion.spring.soft)
  : undefined;

const useStyles = makeStyles((th) => ({
  band: {
    position: 'absolute',
    start: AXIS_GUTTER,
    end: 0,
    borderRadius: th.radius.md,
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.state.info,
    overflow: 'hidden',
    alignItems: 'flex-end',
    padding: th.space['4'],
  },
}));

export function RainBand({
  start,
  end,
  axis,
  reduced,
}: {
  readonly start: number;
  readonly end: number;
  readonly axis: Axis;
  readonly reduced: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const top = useSharedValue(yOf(start, axis));
  const height = useSharedValue((end - start) * PT_PER_MINUTE);
  const drift = useSharedValue(0);
  useEffect(() => {
    const y = yOf(start, axis);
    const h = (end - start) * PT_PER_MINUTE;
    top.value = reduced || SOFT === undefined ? y : withSpring(y, SOFT);
    height.value = reduced || SOFT === undefined ? h : withSpring(h, SOFT);
  }, [start, end, axis, reduced, top, height]);
  useEffect(() => {
    if (reduced) {
      drift.value = 0;
      return undefined;
    }
    drift.value = withRepeat(
      withSequence(
        withTiming(DRIFT_PT, { duration: DRIFT_HALF_MS, easing: IN_OUT }),
        withTiming(0, { duration: DRIFT_HALF_MS, easing: IN_OUT }),
      ),
      -1,
    );
    return () => cancelAnimation(drift);
  }, [reduced, drift]);
  const style = useAnimatedStyle(() => ({
    top: top.value,
    height: height.value,
    transform: [{ translateY: drift.value }],
  }));
  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t({
        id: 'plan.timeline.rainA11y',
        message: `Rain forecast, ${clockRange(locale, start, end)}`,
      })}
      style={[styles.band, style]}
      pointerEvents="none"
      testID="plan-rain-band"
    >
      <Halftone variant="dark" />
      <Text variant="label" color={theme.semantic.state.info}>
        {upper(t({ id: 'plan.timeline.rain', message: 'Rain' }), locale)}
      </Text>
    </Animated.View>
  );
}
