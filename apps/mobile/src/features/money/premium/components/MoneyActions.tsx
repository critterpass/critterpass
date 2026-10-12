/**
 * The row under the chart (7.17): settle up as the ink pill, then scan a receipt, add an expense
 * and the budget as white circles.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { LineIcon, type LineIconName } from '@/features/trip';
import { Button, PressableScale, usePremiumTheme } from '@/ui/premium';

import { balancesNav } from '../../balances/use-balances-screen';

function Circle(props: {
  readonly icon: LineIconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      testID={props.testID}
    >
      <View
        style={[styles.circle, { backgroundColor: th.color.card, boxShadow: th.shadow.raised }]}
      >
        <LineIcon name={props.icon} size={20} />
      </View>
    </PressableScale>
  );
}

export function MoneyActions({
  settleLabel,
  canSettle,
}: {
  readonly settleLabel: string;
  readonly canSettle: boolean;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  return (
    <View style={[styles.row, { paddingHorizontal: th.space.gutter, gap: th.space.gap8 }]}>
      <View style={styles.flex}>
        <Button
          label={settleLabel}
          onPress={balancesNav.settle}
          disabled={!canSettle}
          testID="money-settle"
        />
      </View>
      <Circle
        icon="scan"
        label={t({ id: 'money.tile.scan', message: 'Scan' })}
        onPress={balancesNav.scan}
        testID="money-scan"
      />
      <Circle
        icon="chart"
        label={t({ id: 'money.tile.budget', message: 'Budget' })}
        onPress={balancesNav.budget}
        testID="money-budget"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
