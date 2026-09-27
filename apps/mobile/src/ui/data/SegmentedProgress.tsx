import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../theme';

export interface SegmentedProgressProps {
  /** Number of segments (steps, story pages, pings). */
  readonly total: number;
  /** Segments already complete. */
  readonly done: number;
  /** Fill colour of complete segments. @default action.primary */
  readonly color?: string;
  /** What is being counted, prefixed to the summary ("Plan"). */
  readonly label?: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: { flexDirection: 'row', gap: th.space['4'] },
  segment: { flex: 1, height: th.space['6'], borderRadius: th.radius.xs },
}));

/** A row of equal segments filled up to `done` (setup steps, budget pings, checklist). */
export function SegmentedProgress({ total, done, color, label, testID }: SegmentedProgressProps) {
  const styles = useStyles();
  const theme = useTheme();
  const filled = Math.min(total, Math.max(0, done));
  const count = t({ id: 'common.data.nOfTotalDone', message: `${filled} of ${total} done` });
  const summary = [label, count].filter(Boolean).join(', ');
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={summary}
      accessibilityValue={{ min: 0, max: total, now: filled }}
      style={styles.row}
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.segment,
            {
              backgroundColor:
                index < filled
                  ? (color ?? theme.semantic.action.primary)
                  : theme.semantic.bg.control,
            },
          ]}
        />
      ))}
    </View>
  );
}
