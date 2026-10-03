/**
 * How full a day is, as five rising bars lit in the day's colour (7a-3, 7b-3). The count is
 * also said in words for screen readers.
 */
import { View } from 'react-native';

import { makeStyles, useTheme } from '../theme';

export const PACE_STEPS = 5;

export interface PaceBarsProps {
  /** 0 (nothing yet) to 5 (packed). */
  readonly level: number;
  readonly color: string;
  /** "Busy day: 4 of 5". */
  readonly accessibilityLabel: string;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space['2'], height: 16 },
  bar: { width: 4, borderRadius: 1 },
}));

export function PaceBars({ level, color, accessibilityLabel, testID }: PaceBarsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const lit = Math.max(0, Math.min(PACE_STEPS, Math.round(level)));
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {Array.from({ length: PACE_STEPS }, (_, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: 7 + index * 2,
              backgroundColor: index < lit ? color : theme.color.ink[600],
            },
          ]}
        />
      ))}
    </View>
  );
}
