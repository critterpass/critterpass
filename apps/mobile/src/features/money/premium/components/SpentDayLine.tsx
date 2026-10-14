/** When it was spent (7.18): "Today ⌄", opening the last week's days as chips in place. */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Button, Text, usePremiumTheme } from '@/ui/premium';

import { DAY_CHIPS, useSpentDayLabel } from '../../add-expense/spent-day';
import { ChoiceStrip } from './ChoiceStrip';

export function SpentDayLine(props: {
  readonly daysBack: number;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onPick: (daysBack: number) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const dayLabel = useSpentDayLabel();
  const now = new Date();
  return (
    <>
      <View style={[styles.line, { paddingHorizontal: th.space.gutter }]}>
        <Text variant="label" tone="muted" style={styles.label}>
          {t({ id: 'money.premium.when', message: 'When' })}
        </Text>
        <Button
          alignSelf="auto"
          label={`${dayLabel(props.daysBack, now)} ⌄`}
          variant="floating"
          size="small"
          onPress={props.onToggle}
          testID="money-add-day"
        />
      </View>
      {props.open ? (
        <ChoiceStrip<number>
          choices={Array.from({ length: DAY_CHIPS }, (_, back) => ({
            value: back,
            label: dayLabel(back, now),
          }))}
          value={props.daysBack}
          onPick={props.onPick}
          testID="money-add-days"
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { width: 56 },
});
