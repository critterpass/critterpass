import { Text, type TextProps, type TextVariant } from '../text/Text';

export interface AmountProps extends Omit<TextProps, 'variant' | 'tabular'> {
  /** The type the amount is set in, chosen by where it sits (a row, a card total, a hero). */
  readonly variant: TextVariant;
}

/**
 * A formatted amount of money ("$92.10", "Rp 450.000"): the caller's variant with figures at one
 * width each, so a column of amounts lines up digit under digit and a total keeps its width as it
 * changes.
 */
export function Amount(props: AmountProps) {
  return <Text {...props} tabular />;
}
