/**
 * The price display as last read on this phone, for formatting helpers that only get a locale
 * (kept apart from the live read so pure helpers and their tests need no database). The screen
 * drawing them calls `useMoneyDisplay()` so a change redraws it.
 */
import {
  DEFAULT_MONEY_DISPLAY,
  priceText,
  withHomePrice,
  type MoneyDisplay,
} from './money-display';

let current: MoneyDisplay = DEFAULT_MONEY_DISPLAY;

export function setCurrentMoneyDisplay(display: MoneyDisplay): void {
  current = display;
}

export function currentMoneyDisplay(): MoneyDisplay {
  return current;
}

/** A price in ISO minor units, shown the way the person chose (see `priceText`). */
export function displayPrice(
  amountMinor: bigint | number,
  currency: string,
  locale: string,
): string {
  const minor = typeof amountMinor === 'bigint' ? amountMinor : BigInt(Math.round(amountMinor));
  return priceText(minor, currency, locale, current);
}

/** A price written in its own currency, with the home amount as the person chose (`withHomePrice`). */
export function displayWithHome(
  localText: string,
  amountMinor: bigint | number,
  currency: string,
  locale: string,
): string {
  const minor = typeof amountMinor === 'bigint' ? amountMinor : BigInt(Math.round(amountMinor));
  return withHomePrice(localText, minor, currency, locale, current);
}

/** "≈ S$6.40": a price's home amount for a line under it, or null when it adds nothing. */
export function homeEquivalent(
  amountMinor: bigint | number,
  currency: string,
  locale: string,
): string | null {
  const display = current;
  if (display.mode === 'local' || display.homeCurrency === null) return null;
  if (display.homeCurrency === currency) return null;
  const text = displayWithHome('', amountMinor, currency, locale);
  if (text === '') return null;
  const home = text.startsWith(' ≈ ') ? text.slice(3) : text;
  return `≈ ${home}`;
}
