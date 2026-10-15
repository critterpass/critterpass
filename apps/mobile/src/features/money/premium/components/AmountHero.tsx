/**
 * Add expense's amount (7.18): the digits large and tabular, with the currency mark at half their
 * height raised to their top, on the side the locale writes it (tap it to pick another), and what
 * it comes to under them.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { hitSlopFor, PressableScale, Text } from '@/ui/premium';

import { symbolOf, symbolTrails } from '../../format';

/** The currency symbol is smaller than a finger: reach 44 pt around it. */
const SMALL_TARGET = hitSlopFor(28, 28);

export function AmountHero(props: {
  readonly amount: string;
  readonly currency: string;
  readonly locale: string;
  readonly approx: string | undefined;
  readonly onCurrency: () => void;
}) {
  const { t } = useLingui();
  const { currency } = props;
  const mark = (
    <PressableScale
      onPress={props.onCurrency}
      hitSlop={SMALL_TARGET}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'money.premium.currency', message: `Currency, ${currency}` })}
      testID="money-add-currency"
    >
      <Text variant="display" tone="placeholder" style={styles.mark}>
        {symbolOf(currency)}
      </Text>
    </PressableScale>
  );
  const trails = symbolTrails(currency, props.locale);
  return (
    <View style={styles.amount}>
      <View style={styles.amountRow}>
        {trails ? null : mark}
        <Text
          variant="hero"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          style={styles.tabular}
          testID="money-add-amount"
        >
          {props.amount}
        </Text>
        {trails ? mark : null}
      </View>
      {props.approx === undefined ? null : (
        <Text variant="rowText" tone="muted">
          {props.approx}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { alignItems: 'center', gap: 2, paddingHorizontal: 20 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  mark: { marginTop: 12 },
  tabular: { fontVariant: ['tabular-nums'] },
});
