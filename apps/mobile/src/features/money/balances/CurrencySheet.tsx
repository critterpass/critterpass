/**
 * The crew-currency chip's sheet (undesigned): what the crew currency is for, and for an organiser
 * the currencies to switch to (the current one, the trip's local one, each member's home one).
 * Switching re-rates the whole ledger on the server, so it goes online and says so.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useSettlementCurrency } from './use-settlement-currency';

const useStyles = makeStyles((t) => ({ body: { padding: t.space['16'], gap: t.space['12'] } }));

export interface CurrencySheetProps {
  readonly crewId: string;
  readonly current: string;
  readonly choices: readonly string[];
  readonly organiser: boolean;
  readonly onClose: () => void;
}

export function CurrencySheet({
  crewId,
  current,
  choices,
  organiser,
  onClose,
}: CurrencySheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const { pending, error, pick } = useSettlementCurrency(crewId, current, onClose);
  const title = t({ id: 'money.currency.title', message: `The crew counts in ${current}` });

  return (
    <Sheet detents={['fit']} onDismiss={onClose} accessibilityLabel={title} testID="money-currency">
      <View style={styles.body}>
        <Text variant="h3" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'money.currency.body',
            message:
              'Spend in any currency. Balances and settling up use this one, at the rate on the day each expense was added.',
          })}
        </Text>
        {organiser ? (
          <SettingsGroup
            title={t({ id: 'money.currency.switch', message: 'Switch the crew currency' })}
            testID="money-currency-choices"
            rows={choices.map((currency) => ({
              key: currency,
              kind: 'check' as const,
              title: currency,
              checked: currency === current,
              disabled: pending,
              onPress: () => pick(currency),
            }))}
          />
        ) : (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {t({
              id: 'money.currency.organiserOnly',
              message: 'Only an organiser can switch it.',
            })}
          </Text>
        )}
        {error ? (
          <Text variant="bodySm" color={theme.semantic.state.urgent} testID="money-currency-error">
            {t({
              id: 'money.currency.error',
              message: "That didn't go through. Check your connection and try again.",
            })}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
