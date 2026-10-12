/**
 * The budget's bar (7.29): ink up to the plan (or to what was spent, under it), pink past it, the
 * planned line as a tick, and "Day 1 · Planned line · Day N" under it.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';

export function BudgetBar(props: {
  /** How much of the bar is ink, 0–1. */
  readonly inkShare: number;
  /** Where the planned line sits, 0–1. */
  readonly planAt: number;
  readonly over: boolean;
  readonly days: number;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { inkShare, planAt, over } = props;
  const lastDay = String(props.days);
  return (
    <View style={styles.barBlock} testID="money-budget-bar">
      <View style={[styles.track, { backgroundColor: th.color.control }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.min(1, inkShare) * 100}%`, backgroundColor: th.color.ink },
          ]}
        />
        {!over ? null : (
          <View style={[styles.fill, styles.overPart, { backgroundColor: th.accent.pink }]} />
        )}
      </View>
      <View
        style={[
          styles.planLine,
          { left: `${Math.min(1, planAt) * 100}%`, backgroundColor: th.color.ink },
        ]}
      />
      <View style={styles.dayRow}>
        <Text variant="captionMuted" tone="muted">
          {t({ id: 'money.premium.budget.dayOne', message: 'Day 1' })}
        </Text>
        <Text variant="captionMuted" tone="muted">
          {t({ id: 'money.premium.budget.planLine', message: 'Planned line' })}
        </Text>
        <Text variant="captionMuted" tone="muted">
          {t({ id: 'money.premium.budget.lastDay', message: `Day ${lastDay}` })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barBlock: { gap: 6 },
  track: { height: 14, borderRadius: 7, overflow: 'hidden', flexDirection: 'row' },
  fill: { height: 14 },
  overPart: { flex: 1 },
  planLine: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 20,
    marginLeft: -1,
    borderRadius: 1,
  },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
