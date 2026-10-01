/**
 * The typed amount with its rolling digits and the "≈ $28.42 · $4.74 each" line. Zero-decimal
 * currencies (IDR, JPY, VND) use the keypad amount as drawn; currencies with cents roll the whole
 * units and show the cents beside them. The currency symbol opens the currency picker.
 */
import { displayDecimals, isKnownCurrency } from '@cp/cost-engine';
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Odometer } from '@/ui/data/Odometer';
import { KeypadAmount } from '@/ui/inputs/KeypadAmount';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { MIN_TOUCH_TARGET } from '@/ui/theme';

import { formatAmount, symbolOf, symbolTrails } from '../format';
import { unitsToMinor } from './draft';

export interface AmountEntryProps {
  readonly digits: string;
  readonly currency: string;
  readonly approx: string | undefined;
  readonly onCurrency: () => void;
  readonly testID?: string;
}

export function AmountEntry({ digits, currency, approx, onCurrency, testID }: AmountEntryProps) {
  const locale = useLocale();
  const { t } = useLingui();
  const decimals = isKnownCurrency(currency) ? displayDecimals(currency) : 0;
  const units = Number(digits === '' ? '0' : digits);
  const label = formatAmount(unitsToMinor(digits, currency), currency, locale);
  const symbol = symbolOf(currency);
  const trails = symbolTrails(currency, locale);
  const separator = format.number(locale, 1.5).replace(/\d/gu, '') || '.';
  return (
    <Stack gap="4" align="center" testID={testID}>
      <Pressable
        onPress={onCurrency}
        accessibilityRole="button"
        accessibilityLabel={t({
          id: 'money.add.currencyA11y',
          message: `Currency ${currency}, change`,
        })}
        style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
        testID="money-add-currency"
      >
        {decimals === 0 ? (
          <KeypadAmount value={units} currency={symbol} currencyAfter={trails} label={label} />
        ) : (
          <Row gap="6" align="flex-end">
            {trails ? null : <Text variant="h3">{symbol}</Text>}
            <Odometer
              value={Math.trunc(units / 10 ** decimals)}
              suffix={`${separator}${String(units % 10 ** decimals).padStart(decimals, '0')}`}
              accessibilityLabel={label}
            />
            {trails ? <Text variant="h3">{symbol}</Text> : null}
          </Row>
        )}
      </Pressable>
      {approx === undefined ? null : (
        <SecondaryText testID="money-add-approx">{approx}</SecondaryText>
      )}
    </Stack>
  );
}
