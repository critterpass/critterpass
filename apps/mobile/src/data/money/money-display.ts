/**
 * How the person wants prices shown (3n-8 "Show prices in"), as plain data and pure functions:
 * HOME (in their home currency), LOCAL (in the price's own currency) or BOTH ("Rp 75.000 ≈ S$6.40").
 * The home currency is the one they chose, else their home airport's country's. Conversions use the
 * newest synced fx run on the phone, so prices convert offline; with no rate for a pair the price
 * shows in its own currency rather than guess.
 */
import {
  convert,
  convertViaBase,
  currencyForCountry,
  formatMoney,
  isKnownCountry,
  isKnownCurrency,
  isStaleSnapshot,
  type CurrencyCode,
  type FxSnapshot,
  type Money,
} from '@cp/cost-engine';
import type { PriceDisplayMode } from '@cp/domain';

export interface MoneyDisplay {
  readonly mode: PriceDisplayMode;
  /** Null until the person has a home airport (or chose a currency). */
  readonly homeCurrency: CurrencyCode | null;
  /** The home currency came from the home airport, not from a choice in Settings. */
  readonly homeFromAirport: boolean;
  /** The home airport's country's currency, whatever was chosen. */
  readonly airportCurrency: CurrencyCode | null;
  /** The newest fx run on the phone (one `as_of`). */
  readonly fx: readonly FxSnapshot[];
}

export const DEFAULT_MONEY_DISPLAY: MoneyDisplay = {
  mode: 'local',
  homeCurrency: null,
  homeFromAirport: false,
  airportCurrency: null,
  fx: [],
};

export interface MoneyDisplayInput {
  readonly priceDisplay: string | null;
  readonly homeCurrencyOverride: string | null;
  /** ISO 3166-1 alpha-2 of the home airport's country. */
  readonly homeCountry: string | null;
  readonly fx: readonly FxSnapshot[];
}

function modeOf(raw: string | null): PriceDisplayMode {
  return raw === 'home' || raw === 'local' || raw === 'both' ? raw : 'local';
}

export function moneyDisplayOf(input: MoneyDisplayInput): MoneyDisplay {
  const chosen =
    input.homeCurrencyOverride !== null && isKnownCurrency(input.homeCurrencyOverride)
      ? input.homeCurrencyOverride
      : null;
  const fromAirport =
    input.homeCountry !== null && isKnownCountry(input.homeCountry)
      ? currencyForCountry(input.homeCountry)
      : null;
  return {
    mode: modeOf(input.priceDisplay),
    homeCurrency: chosen ?? fromAirport,
    homeFromAirport: chosen === null && fromAirport !== null,
    airportCurrency: fromAirport,
    fx: input.fx,
  };
}

/** The other currency of a snapshot relating `currency`, or null. */
function otherSide(snapshot: FxSnapshot, currency: string): CurrencyCode | null {
  if (snapshot.base === currency) return snapshot.quote;
  if (snapshot.quote === currency) return snapshot.base;
  return null;
}

/**
 * `amount` in `target` through the newest rates: a direct pair, else two pairs that meet in one
 * currency (a shared base or a shared quote). Null when no such rates are on the phone.
 */
export function convertMoney(
  amount: Money,
  target: CurrencyCode,
  fx: readonly FxSnapshot[],
): Money | null {
  if (amount.currency === target) return amount;
  try {
    const direct = fx.find((s) => otherSide(s, amount.currency) === target);
    if (direct !== undefined) return convert(amount, target, direct);
    for (const first of fx) {
      const middle = otherSide(first, amount.currency);
      if (middle === null || middle === target) continue;
      const second = fx.find((s) => s !== first && otherSide(s, middle) === target);
      if (second === undefined) continue;
      const shared = first.base === middle && second.base === middle;
      return shared
        ? convertViaBase(amount, target, first, second)
        : convert(convert(amount, middle, first), target, second);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * A price (in ISO minor units) as the person wants it: "Rp 75.000", "S$6.40" or "Rp 75.000 ≈ S$6.40". The price's own
 * side reads in `locale`; an unknown currency or a missing rate falls back to the price's own
 * currency, never a made-up number.
 */
export function priceText(
  amountMinor: bigint,
  currency: string,
  locale: string,
  display: MoneyDisplay,
): string {
  if (!isKnownCurrency(currency)) return [String(currency), String(amountMinor)].join(' ');
  const amount: Money = { amountMinor, currency };
  const local = formatMoney(amount, { locale, mode: 'local' });
  const home = display.homeCurrency;
  if (display.mode === 'local' || home === null || home === amount.currency) return local;
  const converted = convertMoney(amount, home, display.fx);
  if (converted === null) return local;
  return formatMoney(amount, { locale, mode: display.mode, home, converted });
}

/** The newest rate's date, and whether it is older than two days (prices then say "as of"). */
export function fxAsOf(
  display: MoneyDisplay,
  now: Date,
): { readonly asOf: string | null; readonly stale: boolean } {
  const first = display.fx[0];
  if (first === undefined) return { asOf: null, stale: false };
  return { asOf: first.asOf, stale: isStaleSnapshot(first, now) };
}

/**
 * A price already written in its own currency (`localText`, in the screen's own style), as the
 * person chose to see it: unchanged in LOCAL, the home amount alone in HOME, both in BOTH
 * ("Rp 75.000 ≈ S$6.40"). No home currency, the same currency or no rate: unchanged.
 */
export function withHomePrice(
  localText: string,
  amountMinor: bigint,
  currency: string,
  locale: string,
  display: MoneyDisplay,
): string {
  const home = display.homeCurrency;
  if (display.mode === 'local' || home === null || home === currency) return localText;
  if (!isKnownCurrency(currency)) return localText;
  const converted = convertMoney({ amountMinor, currency }, home, display.fx);
  if (converted === null) return localText;
  const homeText = formatMoney(converted, { locale, mode: 'local' });
  return display.mode === 'home' ? homeText : `${localText} ≈ ${homeText}`;
}
