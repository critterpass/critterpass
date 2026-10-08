/**
 * "Amount paid" on a payment: the full amount to start with, written as money in the payment's
 * currency (its symbol, group marks and decimals) and kept that way while a part is typed.
 */
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { TextField } from '@/ui/inputs/TextField';

import { formatAmount } from '../format';
import { amountPaidAfterEdit, amountPaidDigits, amountPaidText } from './amount-paid';

export interface AmountPaidFieldProps {
  /** The amount as keypad digits in the currency's own units ("18640" is US$186.40). */
  readonly digits: string;
  /** What is owed, in minor units. */
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly valid: boolean;
  readonly onDigits: (digits: string) => void;
}

export function AmountPaidField(props: AmountPaidFieldProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const shown = amountPaidText(props.digits, props.currency, locale);
  const longest = amountPaidDigits(props.amountMinor, props.currency).length;
  return (
    <TextField
      label={t({ id: 'money.pay.amount', message: 'Amount paid' })}
      value={shown}
      onChangeText={(text) =>
        props.onDigits(amountPaidAfterEdit(props.digits, shown, text, longest))
      }
      placeholder={formatAmount(0n, props.currency, locale)}
      keyboardType="number-pad"
      {...(props.valid ? {} : { status: 'error' as const })}
      message={t({
        id: 'money.pay.amountHint',
        message: 'Paying part of it? The rest stays open.',
      })}
      testID="money-pay-amount"
    />
  );
}
