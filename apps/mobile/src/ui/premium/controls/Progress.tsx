import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';

import { usePremiumReducedMotion } from '../motion/reduced-motion';
import { SPRINGS } from '../motion/springs';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { progressFraction } from './control-logic';

export interface ProgressBarProps {
  readonly label: string;
  readonly value: number;
  /** @default 1 */
  readonly total?: number;
  /** Right-hand reading; defaults to the percentage. */
  readonly valueLabel?: string;
  readonly testID?: string;
}

/** Label row (12/600) over an 8-high bar: control track, ink fill that grows on the Smooth spring. */
export function ProgressBar({ label, value, total = 1, valueLabel, testID }: ProgressBarProps) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const fraction = progressFraction(value, total);
  const [width, setWidth] = useState(0);
  const fill = useSharedValue(0);
  useEffect(() => {
    const to = width * fraction;
    fill.set(reduced ? to : withSpring(to, SPRINGS.smooth));
  }, [width, fraction, reduced, fill]);
  const bar = useAnimatedStyle(() => ({ width: fill.value }));
  const percent = Math.round(fraction * 100);
  const locale = useLocale();
  const reading =
    valueLabel ?? new Intl.NumberFormat(locale, { style: 'percent' }).format(fraction);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent, text: reading }}
      style={{ gap: theme.space.gap6 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="progressLabel">{label}</Text>
        <Text variant="progressLabel">{reading}</Text>
      </View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          height: theme.size.progressBar,
          borderRadius: theme.radius.progressBar,
          backgroundColor: theme.color.control,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            {
              height: '100%',
              borderRadius: theme.radius.progressBar,
              backgroundColor: theme.color.ink,
            },
            bar,
          ]}
        />
      </View>
    </View>
  );
}

export interface StepProgressProps {
  /** Steps done or under way, 1-based ("2" of 4). */
  readonly current: number;
  readonly total: number;
  readonly testID?: string;
}

/** The "2 of 4" bar: white r20 h56, one 5-high segment per step, ink up to the current one. */
export function StepProgress({ current, total, testID }: StepProgressProps) {
  const theme = usePremiumTheme();
  const segments = Array.from({ length: Math.max(0, total) }, (_, i) => i < current);
  const step = String(current);
  const all = String(total);
  const count = t({ id: 'common.progress.stepOf', message: `${step} of ${all}` });
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: current, text: count }}
      style={{
        height: theme.size.stepProgressBar,
        borderRadius: theme.radius.banner,
        backgroundColor: theme.color.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap12,
        paddingHorizontal: theme.space.gap10,
      }}
    >
      <View style={{ flex: 1, flexDirection: 'row', gap: theme.space.gap4 }}>
        {segments.map((done, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: theme.size.progressStep,
              borderRadius: theme.radius.progressStep,
              backgroundColor: done ? theme.color.ink : theme.color.progressTodo,
            }}
          />
        ))}
      </View>
      <Text variant="label" tone="muted">
        {count}
      </Text>
    </View>
  );
}
