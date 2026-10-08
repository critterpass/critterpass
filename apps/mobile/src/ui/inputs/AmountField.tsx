import { amountText, digitsAfterEdit, type AmountUnit } from './amount-digits';
import { TextField, type FieldStatus } from './TextField';

export interface AmountFieldProps {
  readonly label: string;
  /** The amount as digits in the field's unit ("18640" is US$186.40); see `amount-digits.ts`. */
  readonly digits: string;
  readonly currency: string;
  readonly locale: string;
  readonly onDigits: (digits: string) => void;
  /** `whole` for a figure typed in whole major units (a budget). @default 'display' */
  readonly unit?: AmountUnit;
  /** The longest amount the field takes, in digits, when that is longer than the default. */
  readonly maxDigits?: number;
  readonly status?: FieldStatus;
  /** Helper or error text under the field. */
  readonly message?: string;
  readonly autoFocus?: boolean;
  readonly testID?: string;
}

/**
 * A typed amount of money: a number pad whose digits read as money in the currency while they are
 * typed (its symbol where the locale puts it, group marks and decimals from the engine's table).
 * The caller holds the digits and reads exact minor units with `digitsToMinor`.
 *
 * Use it wherever an amount is typed into a field; the expense screen's big keypad is `Keypad`.
 */
export function AmountField({
  label,
  digits,
  currency,
  locale,
  onDigits,
  unit = 'display',
  maxDigits,
  status,
  message,
  autoFocus,
  testID,
}: AmountFieldProps) {
  const shown = amountText(digits, currency, locale, unit);
  return (
    <TextField
      label={label}
      value={shown}
      onChangeText={(text) => onDigits(digitsAfterEdit(digits, shown, text, maxDigits))}
      placeholder={amountText('0', currency, locale, unit)}
      keyboardType="number-pad"
      {...(status === undefined ? {} : { status })}
      {...(message === undefined ? {} : { message })}
      {...(autoFocus === undefined ? {} : { autoFocus })}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
