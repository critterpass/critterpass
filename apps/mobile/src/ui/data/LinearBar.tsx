import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { I18nManager, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';
import { format } from '@cp/i18n';

import { bezierEasing } from '@/motion/easing';
import { BAR_GROW_STAGGER_MS, useBarGrow } from '@/motion/patterns/bar-grow';
import { staggerDelayMs, useReducedImpactMotion } from '@/motion/patterns/shared';
import { useLocale } from '@/lib/i18n/use-locale';

import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const columnEasing = bezierEasing(tokens.motion.easing.standard);

/** `barGrow` for vertical columns: same duration, easing and 50 ms stagger as the horizontal bar. */
function useColumnGrow(fraction: number, index: number) {
  const value = useSharedValue(0);
  const reduced = useReducedImpactMotion();
  const delayMs = staggerDelayMs(index, BAR_GROW_STAGGER_MS);
  useEffect(() => {
    if (reduced) {
      value.value = fraction;
      return;
    }
    value.value = withDelay(
      delayMs,
      withTiming(fraction, { duration: tokens.motion.duration.extra, easing: columnEasing }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value is a stable shared value ref.
  }, [fraction, reduced, delayMs]);
  return useAnimatedStyle(() => ({ transform: [{ scaleY: value.value }] }));
}

export interface GrowBarProps {
  /** Filled fraction of the track, 0 to 1 (clamped). */
  readonly fraction: number;
  readonly color: string;
  /** `x` fills from the start edge, `y` rises from the bottom. @default 'x' */
  readonly axis?: 'x' | 'y';
  /** Position in its chart, for the 50 ms `barGrow` stagger. @default 0 */
  readonly index?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** One animated bar fill (`barGrow`); decorative, the owning chart carries the text summary. */
export function GrowBar({ fraction, color, axis = 'x', index = 0, style, testID }: GrowBarProps) {
  const value = clamp01(fraction);
  const horizontal = useBarGrow({ active: axis === 'x', toValue: value, index });
  const vertical = useColumnGrow(axis === 'y' ? value : 0, index);
  const origin = axis === 'y' ? 'bottom' : I18nManager.isRTL ? 'right' : 'left';
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      style={[
        axis === 'x'
          ? { width: `${value * 100}%`, height: '100%' }
          : { height: `${value * 100}%`, width: '100%' },
        { backgroundColor: color, transformOrigin: origin },
        axis === 'x' ? horizontal : vertical,
        style,
      ]}
    />
  );
}

export interface LinearBarProps {
  /** Amount so far (any unit; `max` shares it). */
  readonly value: number;
  readonly max: number;
  /** Fill colour; turns `state.urgent` automatically when `value` exceeds `max`. */
  readonly color?: string;
  /** Row title above the bar ("Stays"). */
  readonly label?: string;
  /** Pre-formatted amounts shown at the end of the title row ("$1,840 / $2,700"). */
  readonly valueLabel?: string;
  /** Text shown when over budget, so the state is never colour-only ("Over by $120"). */
  readonly overLabel?: string;
  /** Marker position (fraction of the track) with its caption, e.g. TODAY. */
  readonly marker?: { readonly at: number; readonly label: string };
  /** Overrides the generated screen-reader summary. */
  readonly accessibilityLabel?: string;
  readonly index?: number;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  track: {
    height: th.space['10'],
    borderRadius: th.radius.xs,
    backgroundColor: th.semantic.bg.control,
    overflow: 'hidden',
  },
  markerWrap: { height: th.space['20'] },
  marker: {
    position: 'absolute',
    top: -th.space['16'],
    width: th.space['2'],
    height: th.space['20'],
    backgroundColor: th.semantic.text.primary,
  },
  markerLabel: { position: 'absolute', top: th.space['4'] },
}));

/** A labelled progress bar (budget categories, plan progress) with over-budget and marker states. */
export function LinearBar({
  value,
  max,
  color,
  label,
  valueLabel,
  overLabel,
  marker,
  accessibilityLabel,
  index = 0,
  testID,
}: LinearBarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const over = value > max;
  const fraction = max > 0 ? value / max : 0;
  const fill = over ? theme.semantic.state.urgent : (color ?? theme.semantic.action.primary);
  const pct = format.percent(locale, fraction);
  const summary =
    accessibilityLabel ??
    [
      label,
      valueLabel,
      over ? overLabel : t({ id: 'common.data.percentUsed', message: `${pct} used` }),
    ]
      .filter(Boolean)
      .join(', ');
  const markerStart = `${clamp01(marker?.at ?? 0) * 100}%` as const;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={summary}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp01(fraction) * 100) }}
    >
      {label || valueLabel ? (
        <Row justify="space-between" align="baseline" style={{ marginBottom: theme.space['8'] }}>
          {label ? <Text variant="title">{label}</Text> : <View />}
          {valueLabel ? <Text variant="monoData">{valueLabel}</Text> : null}
        </Row>
      ) : null}
      <View style={styles.track}>
        <GrowBar fraction={fraction} color={fill} index={index} />
      </View>
      {over && overLabel ? (
        <Text
          variant="label"
          color={theme.semantic.state.urgent}
          style={{ marginTop: theme.space['4'] }}
        >
          {overLabel}
        </Text>
      ) : null}
      {marker ? (
        <View style={styles.markerWrap}>
          <View style={[styles.marker, { start: markerStart }]} />
          <Text variant="label" style={[styles.markerLabel, { start: markerStart }]}>
            {marker.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
