/**
 * How busy a place gets through the day (7e-1 WHEN IT FITS): one bar per hour by level, the fitted
 * slot lit in green, and the hour under every third bar. Read out as the quiet and busy hours.
 */
import { View } from 'react-native';

import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface HourLevel {
  /** Local hour, 0–23. */
  readonly hour: number;
  /** 0 (empty) to 1 (packed). */
  readonly level: number;
}

export interface HourBarsProps {
  readonly hours: readonly HourLevel[];
  /** The hours the fitted slot covers, lit [from, to). */
  readonly lit?: { readonly from: number; readonly to: number } | undefined;
  /** "Quiet until 10, busiest at 12". */
  readonly accessibilityLabel: string;
  readonly height?: number | undefined;
  readonly testID?: string | undefined;
}

const LABEL_EVERY = 3;

const useStyles = makeStyles((t) => ({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space['4'] },
  slot: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end' },
  bar: { borderRadius: t.radius.xs, minHeight: 4 },
  lit: { borderWidth: 2 },
  axis: { flexDirection: 'row', gap: t.space['4'], marginTop: t.space['6'] },
  tick: { flex: 1 },
}));

function hourLabel(hour: number): string {
  return String(hour).padStart(2, '0');
}

export function HourBars({ hours, lit, accessibilityLabel, height = 44, testID }: HourBarsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const isLit = (hour: number) => lit !== undefined && hour >= lit.from && hour < lit.to;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View style={[styles.bars, { height }]}>
        {hours.map((entry) => (
          <View key={entry.hour} style={styles.slot}>
            <View
              style={[
                styles.bar,
                {
                  height: Math.max(4, Math.min(1, entry.level) * height),
                  backgroundColor: isLit(entry.hour) ? theme.color.ink[800] : theme.color.ink[700],
                },
                isLit(entry.hour)
                  ? [styles.lit, { borderColor: theme.semantic.state.success }]
                  : null,
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        {hours.map((entry, index) => (
          <View key={entry.hour} style={styles.tick}>
            {index % LABEL_EVERY === 0 ? (
              <Text variant="monoData" color={theme.semantic.text.secondary} numberOfLines={1}>
                {hourLabel(entry.hour)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
