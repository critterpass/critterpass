/**
 * Start and end of an item (the item sheet's time picker; design in code): a tap on a time opens
 * its hours and quarter-hours to pick from, and −15 / +15 nudge it. Each row is one adjustable
 * control for screen readers, so the same steps work without the buttons.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import type { AccessibilityActionEvent } from 'react-native';
import { View } from 'react-native';

import { SNAP_MINUTES } from '@/motion/gestures/drag-snap';
import { impact } from '@/motion/feedback';
import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { PressScale } from '@/ui/press/PressScale';
import { ActionPill } from '@/ui/plan/ActionPill';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { clock } from './format';

const MAX_MINUTES = 36 * 60;

const useStyles = makeStyles((th) => ({
  row: {
    gap: th.space['4'],
    paddingVertical: th.space['8'],
    borderBottomWidth: th.space['2'] / 2,
    borderBottomColor: th.color.divider,
  },
  value: { minWidth: th.space['32'] * 2, textAlign: 'center' },
  picker: { gap: th.space['8'], paddingVertical: th.space['8'] },
}));

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const QUARTERS = [0, 15, 30, 45] as const;
const two = (value: number) => String(value).padStart(2, '0');

/** Every hour and quarter-hour to pick the time from; anything outside `min`–`max` is off. */
function TimePicker({
  value,
  min,
  max,
  onChange,
  testID,
}: {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (next: number) => void;
  readonly testID: string;
}) {
  const styles = useStyles();
  // A time past midnight stays on its own night: the hours pick within that day.
  const night = Math.floor(value / 1440) * 1440;
  const hour = Math.floor((value - night) / 60);
  const minute = value % 60;
  const pick = (next: number) => {
    impact('snap');
    onChange(Math.min(max, Math.max(min, next)));
  };
  const allowed = (next: number) => next >= min && next <= max;
  return (
    <View style={styles.picker} testID={`${testID}-picker`}>
      <Row gap="6" wrap>
        {HOURS.map((option) => (
          <ActionPill
            key={option}
            label={two(option)}
            selected={option === hour}
            disabled={!QUARTERS.some((quarter) => allowed(night + option * 60 + quarter))}
            onPress={() => pick(night + option * 60 + minute)}
            testID={`${testID}-hour-${option}`}
          />
        ))}
      </Row>
      <Row gap="6" wrap>
        {QUARTERS.map((option) => (
          <ActionPill
            key={option}
            label={`:${two(option)}`}
            selected={option === minute}
            disabled={!allowed(night + hour * 60 + option)}
            onPress={() => pick(night + hour * 60 + option)}
            testID={`${testID}-minute-${option}`}
          />
        ))}
      </Row>
    </View>
  );
}

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
  const [picking, setPicking] = useState(false);
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
    <View style={styles.row}>
      <Row gap="8" align="center" justify="space-between">
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
        <PressScale
          widthClass="narrow"
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t({
            id: 'plan.day.time.pick',
            message: `${label} ${clock(locale, value)}. Pick a time`,
          })}
          onPress={() => setPicking((open) => !open)}
          testID={`${testID}-pick`}
        >
          <Text variant="monoData" style={styles.value} testID={`${testID}-value`}>
            {clock(locale, value)}
          </Text>
        </PressScale>
        <ActionPill
          label="+15"
          disabled={disabled || value >= max}
          accessibilityLabel={t({ id: 'plan.day.time.later', message: 'Later by 15 minutes' })}
          onPress={() => step(1)}
          testID={`${testID}-later`}
        />
      </Row>
      {picking && !disabled ? (
        <TimePicker value={value} min={min} max={max} onChange={onChange} testID={testID} />
      ) : null}
    </View>
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
