import { Canvas, Path } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';

import { makeStyles, useTheme } from '../theme';

/** SVG path of a full circle starting at 12 o'clock and running clockwise (trim with start/end). */
export function ringPath(size: number, stroke: number): string {
  const r = (size - stroke) / 2;
  const c = size / 2;
  return ['M', c, c - r, 'A', r, r, 0, 1, 1, c, c + r, 'A', r, r, 0, 1, 1, c, c - r].join(' ');
}

export interface ProgressRingProps {
  /** Filled fraction, 0 to 1 (clamped). */
  readonly progress: number;
  /** Outer diameter in points. @default 64 */
  readonly size?: number;
  /** Ring thickness. @default 6 */
  readonly stroke?: number;
  /** @default action.primary */
  readonly color?: string;
  /** Centre content (countdown, icon, count); decorative when `accessibilityLabel` summarises it. */
  readonly children?: ReactNode;
  /** Screen-reader summary; defaults to the localised percentage. */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

const useStyles = makeStyles(() => ({
  centre: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
}));

/** Circular progress (countdown drain, plan completeness, hold progress) on a `bg.control` track. */
export function ProgressRing({
  progress,
  size = 64,
  stroke = 6,
  color,
  children,
  accessibilityLabel,
  testID,
}: ProgressRingProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const value = Math.min(1, Math.max(0, progress));
  const path = ringPath(size, stroke);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? format.percent(locale, value)}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ width: size, height: size }}
    >
      <Canvas style={{ width: size, height: size }}>
        <Path path={path} style="stroke" strokeWidth={stroke} color={theme.semantic.bg.control} />
        <Path
          path={path}
          style="stroke"
          strokeWidth={stroke}
          strokeCap="round"
          color={color ?? theme.semantic.action.primary}
          start={0}
          end={value}
        />
      </Canvas>
      {children ? (
        <View style={styles.centre} importantForAccessibility="no-hide-descendants">
          {children}
        </View>
      ) : null}
    </View>
  );
}
