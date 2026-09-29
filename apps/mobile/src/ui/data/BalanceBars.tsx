import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { GrowBar } from './LinearBar';

export interface Balance {
  readonly name: string;
  /** `owed` = the crew owes them; `owes` = they owe the crew. */
  readonly direction: 'owed' | 'owes' | 'even';
  /** Bar length relative to the largest balance on screen, 0 to 1. */
  readonly fraction: number;
  /** Pre-formatted signed amount ("+186.40", "−41.00"). */
  readonly amountLabel: string;
  /** The viewer's own row: its bar and amount are drawn in the accent yellow. */
  readonly highlight?: boolean;
}

export interface BalanceBarsProps {
  readonly balances: readonly Balance[];
  /** Column headings either side of the centre line ("Owes", "Is owed"). */
  readonly owesHeading: string;
  readonly owedHeading: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: { alignItems: 'center', gap: th.space['10'], minHeight: th.space['32'] },
  name: { width: '22%' },
  half: { flex: 1, height: th.space['14'], flexDirection: 'row' },
  owesHalf: { justifyContent: 'flex-end' },
  bar: { height: '100%', borderRadius: th.radius.xs, overflow: 'hidden' },
  centre: {
    width: th.space['2'],
    alignSelf: 'stretch',
    backgroundColor: th.semantic.border.decorative,
  },
  amount: { width: '22%', textAlign: 'right' },
}));

/** Who owes whom: bars grow out from a centre line, green right for owed, pink left for owes. */
export function BalanceBars({ balances, owesHeading, owedHeading, testID }: BalanceBarsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const spoken = balances.map(({ name, direction, amountLabel: amount }) => {
    if (direction === 'owed')
      return t({ id: 'common.data.balanceOwed', message: `${name} is owed ${amount}` });
    if (direction === 'owes')
      return t({ id: 'common.data.balanceOwes', message: `${name} owes ${amount}` });
    return t({ id: 'common.data.balanceEven', message: `${name} is settled` });
  });
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={spoken.join('; ')}
    >
      <Row style={styles.row} importantForAccessibility="no-hide-descendants">
        <View style={styles.name} />
        <Text variant="eyebrow" style={[styles.half, styles.owesHalf]}>
          {owesHeading}
        </Text>
        <View style={styles.centre} />
        <Text variant="eyebrow" style={styles.half}>
          {owedHeading}
        </Text>
        <View style={styles.amount} />
      </Row>
      {balances.map((balance, index) => (
        <Row key={balance.name} style={styles.row} importantForAccessibility="no-hide-descendants">
          <Text variant="rowTitle" numberOfLines={1} style={styles.name}>
            {balance.name}
          </Text>
          <View style={[styles.half, styles.owesHalf]}>
            {balance.direction === 'owes' ? (
              <View
                style={[
                  styles.bar,
                  { width: `${Math.min(1, balance.fraction) * 100}%`, transform: [{ scaleX: -1 }] },
                ]}
              >
                <GrowBar fraction={1} color={theme.semantic.state.urgent} index={index} />
              </View>
            ) : null}
          </View>
          <View style={styles.centre} />
          <View style={styles.half}>
            {balance.direction === 'owed' ? (
              <View style={[styles.bar, { width: `${Math.min(1, balance.fraction) * 100}%` }]}>
                <GrowBar
                  fraction={1}
                  color={
                    balance.highlight === true
                      ? theme.semantic.action.primary
                      : theme.semantic.state.success
                  }
                  index={index}
                />
              </View>
            ) : null}
          </View>
          <Text
            variant="monoData"
            style={styles.amount}
            color={balance.highlight === true ? theme.semantic.action.primary : undefined}
          >
            {balance.amountLabel}
          </Text>
        </Row>
      ))}
    </View>
  );
}
