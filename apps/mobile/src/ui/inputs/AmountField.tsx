import { digitsAfterEdit } from './amount-edit';
import { TextField, type FieldStatus } from './TextField';

export interface AmountFieldProps {
  readonly label: string;
  /** The amount as digits run together in the field's unit ("18640" is US$186.40). */
  readonly digits: string;
  /** The digits written as money ("US$186.40"); empty while nothing is typed. */
  readonly shown: string;
  /** Zero written the same way ("US$0.00"), shown while the field is empty. */
  readonly placeholder: string;
  readonly onDigits: (digits: string) => void;
  /** The longest amount the field takes, in digits, when that is longer than the default. */
  readonly maxDigits?: number;
  readonly status?: FieldStatus;
  /** Helper or error text under the field. */
  readonly message?: string;
  readonly autoFocus?: boolean;
  readonly testID?: string;
}

/**
 * A typed amount of money: a number pad whose digits read as money while they are typed. The
 * caller holds the digits and passes them formatted; `@/data/money/amount-digits` does both ways
 * from the engine's currency table (`amountText` for `shown` and `placeholder`, `digitsToMinor` for
 * the exact amount), so the symbol, group marks and decimals are the currency's own.
 *
 * Use it wherever an amount is typed into a field; the expense screen's big keypad is `Keypad`.
 */
export function AmountField({
  label,
  digits,
  shown,
  placeholder,
  onDigits,
  maxDigits,
  status,
  message,
  autoFocus,
  testID,
}: AmountFieldProps) {
  return (
    <TextField
      label={label}
      value={shown}
      onChangeText={(text) => onDigits(digitsAfterEdit(digits, shown, text, maxDigits))}
      placeholder={placeholder}
      keyboardType="number-pad"
      {...(status === undefined ? {} : { status })}
      {...(message === undefined ? {} : { message })}
      {...(autoFocus === undefined ? {} : { autoFocus })}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
