/**
 * Start and end of an item in 15-minute steps (the item sheet's time picker; design in code). Each
 * row is one adjustable control for screen readers, so the same steps work without the buttons.
 */
import { useLingui } from '@lingui/react/macro';
import type { AccessibilityActionEvent } from 'react-native';
import { View } from 'react-native';

import { SNAP_MINUTES } from '@/motion/gestures/drag-snap';
import { impact } from '@/motion/feedback';
import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { ActionPill } from '@/ui/plan/ActionPill';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { clock } from './format';

const MAX_MINUTES = 36 * 60;

const useStyles = makeStyles((th) => ({
  row: {
    paddingVertical: th.space['8'],
    borderBottomWidth: th.space['2'] / 2,
    borderBottomColor: th.color.divider,
  },
  value: { minWidth: th.space['32'] * 2, textAlign: 'center' },
}));

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  testID,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (next: number) => void;
  readonly disabled: boolean;
  readonly testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const step = (direction: 1 | -1) => {
    const next = Math.min(max, Math.max(min, value + direction * SNAP_MINUTES));
    if (next === value) return;
    impact('snap');
    onChange(next);
  };
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') step(1);
    if (event.nativeEvent.actionName === 'decrement') step(-1);
  };
  return (
    <Row gap="8" align="center" justify="space-between" style={styles.row}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: clock(locale, value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        style={{ flex: 1 }}
      >
        <Text variant="label" color={theme.semantic.text.secondary}>
          {label}
        </Text>
      </View>
      <ActionPill
        label="−15"
        disabled={disabled || value <= min}
        accessibilityLabel={t({ id: 'plan.day.time.earlier', message: 'Earlier by 15 minutes' })}
        onPress={() => step(-1)}
        testID={`${testID}-earlier`}
      />
      <Text variant="monoData" style={styles.value} testID={`${testID}-value`}>
        {clock(locale, value)}
      </Text>
      <ActionPill
        label="+15"
        disabled={disabled || value >= max}
        accessibilityLabel={t({ id: 'plan.day.time.later', message: 'Later by 15 minutes' })}
        onPress={() => step(1)}
        testID={`${testID}-later`}
      />
    </Row>
  );
}

/** Start moves the whole item (its length kept); end changes its length (15 minutes at least). */
export function TimeRangeField({
  start,
  end,
  onChange,
  disabled = false,
}: {
  readonly start: number;
  readonly end: number;
  readonly onChange: (start: number, end: number) => void;
  readonly disabled?: boolean;
}) {
  const { t } = useLingui();
  const length = end - start;
  return (
    <View testID="plan-time-range">
      <Stepper
        label={t({ id: 'plan.day.time.starts', message: 'Starts' })}
        value={start}
        min={0}
        max={MAX_MINUTES - length}
        onChange={(next) => onChange(next, next + length)}
        disabled={disabled}
        testID="plan-time-start"
      />
      <Stepper
        label={t({ id: 'plan.day.time.ends', message: 'Ends' })}
        value={end}
        min={start + SNAP_MINUTES}
        max={MAX_MINUTES}
        onChange={(next) => onChange(start, next)}
        disabled={disabled}
        testID="plan-time-end"
      />
    </View>
  );
}
