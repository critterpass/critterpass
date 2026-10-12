/**
 * A stop's start and end in the premium sheet: each a row with its time between − and + (15
 * minutes a step). Start moves the whole stop and keeps its length; end changes the length, never
 * under 15 minutes. Each row is one adjustable control for screen readers.
 */
import { useLingui } from '@lingui/react/macro';
import type { AccessibilityActionEvent } from 'react-native';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion/feedback';
import { SNAP_MINUTES } from '@/motion/gestures/drag-snap';
import { Icon, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { clock } from '../../day/format';

const MAX_MINUTES = 36 * 60;

function TimeRow(props: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (next: number) => void;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const step = (by: 1 | -1) => {
    const next = Math.min(props.max, Math.max(props.min, props.value + by * SNAP_MINUTES));
    if (next === props.value) return;
    impact('snap');
    props.onChange(next);
  };
  const button = (by: 1 | -1) => (
    <PressableScale
      onPress={() => step(by)}
      disabled={by === -1 ? props.value <= props.min : props.value >= props.max}
      accessible={false}
      importantForAccessibility="no"
      testID={`${props.testID}-${by === 1 ? 'later' : 'earlier'}`}
      style={{
        width: 40,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.control,
      }}
    >
      <Icon name={by === 1 ? 'plus' : 'minus'} size={16} color={theme.color.ink} />
    </PressableScale>
  );
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.label}
      accessibilityValue={{ text: clock(locale, props.value) }}
      accessibilityActions={[
        {
          name: 'increment',
          label: t({ id: 'plan.day.time.later', message: 'Later by 15 minutes' }),
        },
        {
          name: 'decrement',
          label: t({ id: 'plan.day.time.earlier', message: 'Earlier by 15 minutes' }),
        },
      ]}
      onAccessibilityAction={(event: AccessibilityActionEvent) =>
        step(event.nativeEvent.actionName === 'increment' ? 1 : -1)
      }
      testID={props.testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap10,
        paddingVertical: theme.space.gap8,
        paddingHorizontal: theme.space.rowPadH,
      }}
    >
      <Text variant="rowText" tone="muted" style={{ flex: 1 }}>
        {props.label}
      </Text>
      {button(-1)}
      <Text variant="rowTitle" align="center" style={{ minWidth: 64 }}>
        {clock(locale, props.value)}
      </Text>
      {button(1)}
    </View>
  );
}

export function TimeRows(props: {
  readonly start: number;
  readonly end: number;
  readonly onChange: (start: number, end: number) => void;
}) {
  const { t } = useLingui();
  const { start, end } = props;
  const length = end - start;
  return (
    <View testID="plan-time-range">
      <TimeRow
        label={t({ id: 'plan.day.time.starts', message: 'Starts' })}
        value={start}
        min={0}
        max={MAX_MINUTES - length}
        onChange={(next) => props.onChange(next, next + length)}
        testID="plan-time-start"
      />
      <TimeRow
        label={t({ id: 'plan.day.time.ends', message: 'Ends' })}
        value={end}
        min={start + SNAP_MINUTES}
        max={MAX_MINUTES}
        onChange={(next) => props.onChange(start, next)}
        testID="plan-time-end"
      />
    </View>
  );
}
