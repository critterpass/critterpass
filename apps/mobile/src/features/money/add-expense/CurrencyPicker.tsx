/**
 * The currency an expense was paid in (undesigned): the trip's local currency, the crew's, your
 * home one and any used recently, as check rows. Typed amounts start over on a switch.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Sheet } from '@/ui/sheet/Sheet';
import { makeStyles } from '@/ui/theme';

import { symbolOf } from '../format';

const useStyles = makeStyles((t) => ({ body: { padding: t.space['16'] } }));

export function CurrencyPicker({
  currencies,
  current,
  onPick,
  onClose,
}: {
  readonly currencies: readonly string[];
  readonly current: string;
  readonly onPick: (currency: string) => void;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  const title = t({ id: 'money.add.currencyTitle', message: 'Paid in' });
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID="money-currency-picker"
    >
      <View style={styles.body}>
        <SettingsGroup
          rows={currencies.map((currency) => ({
            key: currency,
            kind: 'check' as const,
            title: `${currency} · ${symbolOf(currency)}`,
            checked: currency === current,
            onPress: () => onPick(currency),
          }))}
        />
      </View>
    </Sheet>
  );
}
