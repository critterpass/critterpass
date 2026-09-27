import { t } from '@lingui/core/macro';
import { Canvas, Path } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';

import { makeStyles, useTheme } from '../theme';
import { ringPath } from './ProgressRing';

export interface DonutSegment {
  readonly label: string;
  /** Share of the whole in any unit; segments are normalised by their sum. */
  readonly value: number;
  readonly color: string;
}

export interface DonutProps {
  readonly segments: readonly DonutSegment[];
  /** @default 120 */
  readonly size?: number;
  /** @default 16 */
  readonly stroke?: number;
  /** Centre content (total, caption). */
  readonly children?: ReactNode;
  /** Prefix for the generated summary ("Spent by category"). */
  readonly title?: string;
  readonly testID?: string;
}

const useStyles = makeStyles(() => ({
  centre: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
}));

/** Share-of-whole ring; its summary reads every segment as "{label} {percent}". */
export function Donut({ segments, size = 120, stroke = 16, children, title, testID }: DonutProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const path = ringPath(size, stroke);
  const shares = segments.map((segment) => (total > 0 ? Math.max(0, segment.value) / total : 0));
  const arcs = segments.map((segment, index) => {
    const start = shares.slice(0, index).reduce((sum, share) => sum + share, 0);
    const share = shares[index] ?? 0;
    return { segment, start, end: start + share, share };
  });
  const parts = arcs.map(({ segment, share }) => {
    const pct = format.percent(locale, share);
    const name = segment.label;
    return t({ id: 'common.data.segmentShare', message: `${name} ${pct}` });
  });
  const summary = [title, format.list(locale, parts)].filter(Boolean).join(': ');
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      style={{ width: size, height: size }}
    >
      <Canvas style={{ width: size, height: size }}>
        <Path path={path} style="stroke" strokeWidth={stroke} color={theme.semantic.bg.control} />
        {arcs.map(({ segment, start, end }) => (
          <Path
            key={segment.label}
            path={path}
            style="stroke"
            strokeWidth={stroke}
            color={segment.color}
            start={start}
            end={end}
          />
        ))}
      </Canvas>
      {children ? (
        <View style={styles.centre} importantForAccessibility="no-hide-descendants">
          {children}
        </View>
      ) : null}
    </View>
  );
}
