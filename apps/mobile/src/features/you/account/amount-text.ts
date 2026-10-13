import { formatMoney, isKnownCurrency } from '@cp/cost-engine';

/** "S$186.40"; a currency the formatter does not know reads as its code and the minor amount. */
export function amountText(minor: number, currency: string, locale: string): string {
  const code = currency;
  if (!isKnownCurrency(code)) return `${currency} ${String(minor)}`;
  return formatMoney({ amountMinor: BigInt(minor), currency: code }, { locale, mode: 'local' });
}
