import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';

import { PressScale } from '../press/PressScale';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

export interface SegmentBudgetProps {
  /** Filled segments, 0–`segments`. */
  readonly value: number;
  readonly onChange: (value: number) => void;
  /** Accessible name ("Location pings per day"). */
  readonly label: string;
  /** @default 10 */
  readonly segments?: number;
  readonly disabled?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: t.space['4'], minHeight: MIN_TOUCH_TARGET },
  cell: { flex: 1, minWidth: 0, justifyContent: 'center', minHeight: MIN_TOUCH_TARGET },
  bar: { height: 18, borderRadius: t.radius.xs },
}));

/** A 10-segment budget (ping budget, 5b-4): tap a segment to set the level; adjustable for a11y. */
export function SegmentBudget({
  value,
  onChange,
  label,
  segments = 10,
  disabled = false,
  testID,
}: SegmentBudgetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const set = (next: number) => onChange(Math.min(segments, Math.max(0, next)));
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') set(value + 1);
    if (event.nativeEvent.actionName === 'decrement') set(value - 1);
  };
  return (
    <View
      testID={testID}
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max: segments,
        now: value,
        text: t({ id: 'common.segmentBudget.value', message: `${value} of ${segments}` }),
      }}
      accessibilityActions={disabled ? [] : [{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
    >
      {Array.from({ length: segments }, (_, index) => (
        <PressScale
          key={index}
          onPress={() => set(index + 1 === value ? index : index + 1)}
          disabled={disabled}
          widthClass="narrow"
          accessibilityLabel={String(index + 1)}
          style={styles.cell}
        >
          <View
            style={[
              styles.bar,
              {
                backgroundColor:
                  index < value ? theme.semantic.action.primary : theme.semantic.bg.control,
              },
            ]}
          />
        </PressScale>
      ))}
    </View>
  );
}
