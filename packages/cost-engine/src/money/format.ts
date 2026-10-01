/**
 * One money formatter for the whole app: HOME/LOCAL/BOTH display, locale-correct grouping and
 * decimal marks, and disambiguated currency symbols (`S$`, `A$`, `NT$` instead of a bare "$" that
 * could mean any of them). Never converts a `bigint` amount through a lossy JS `number`: the exact
 * decimal digits are built with integer arithmetic and handed to `Intl.NumberFormat` as a string,
 * which the spec (`ToIntlMathematicalValue`) accepts precisely.
 *
 * This module never calls FX conversion itself — `amount` and `converted` are both plain `Money`
 * the caller already has (`converted` computed via `packages/cost-engine/src/fx`, pinned to a
 * snapshot); formatting stays a pure, snapshot-agnostic presentation concern.
 */
import { DomainError, type PriceDisplayMode } from '@cp/domain';

import { currencyExponent, currencySymbol, displayDecimals, type CurrencyCode } from './currencies';
import { formatCurrencyText } from './intl-fallbacks';
import { type Money } from './money';
import { divideRounded, type RoundingMode } from './round';

export interface FormatMoneyOptions {
  /** Locale for `amount` itself — the destination/local convention a price is naturally priced in. */
  readonly locale: string;
  readonly mode: PriceDisplayMode;
  /**
   * Locale for the home-currency side of 'home'/'both' (docs/product-decisions.md §3n-8: an IDR
   * price groups as "75.000" in `id-ID` while its "≈ S$6.40" reads in the viewer's own `en-SG`
   * convention). Defaults to `locale` when the caller has only one locale to give.
   */
  readonly homeLocale?: string;
  /** The app's home currency; required when `mode` is 'home' or 'both'. */
  readonly home?: CurrencyCode;
  /** `amount` converted into `home`; required when `mode` needs it and the currencies differ. */
  readonly converted?: Money;
  /** Rounding applied only to the *displayed* digits, never to the stored amount. Default `half_even`. */
  readonly roundingMode?: RoundingMode;
}

/**
 * Exact `amountMinor` (ISO/stored exponent) rescaled to `decimals` display digits, as a decimal
 * string — no float ever participates. `decimals` is always <= the stored exponent in practice
 * (`DISPLAY_DECIMAL_OVERRIDES` only ever reduces precision for cash practice), but the rescale is
 * skipped entirely rather than assumed whenever they already match.
 */
function toDisplayDecimalString(
  amount: Money,
  decimals: number,
  roundingMode: RoundingMode,
): string {
  const storedExponent = currencyExponent(amount.currency);
  const scale = storedExponent - decimals;
  const scaledMinor =
    scale <= 0
      ? amount.amountMinor
      : divideRounded(amount.amountMinor, 10n ** BigInt(scale), roundingMode);

  const negative = scaledMinor < 0n;
  const abs = negative ? -scaledMinor : scaledMinor;
  if (decimals === 0) {
    return `${negative ? '-' : ''}${abs.toString()}`;
  }
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

/**
 * Renders one `Money` value with locale grouping and Critterpass's disambiguated symbol. Uses
 * `Intl.NumberFormat`'s own currency-part placement (prefix/suffix, spacing) for the locale, then
 * swaps in our symbol — CLDR knows *where* the symbol goes, we own *what* the glyph is. Falls back
 * to a plain, ungrouped rendering if the runtime's `Intl` cannot format this currency/locale pair
 * (Hermes ships incomplete locale data for some currencies/locales).
 */
function formatSingle(amount: Money, locale: string, roundingMode: RoundingMode): string {
  const decimals = displayDecimals(amount.currency);
  const decimalString = toDisplayDecimalString(amount, decimals, roundingMode);
  const symbol = currencySymbol(amount.currency);
  try {
    return formatCurrencyText(locale, decimalString, amount.currency, symbol, decimals);
  } catch {
    return `${symbol}${decimalString}`;
  }
}

function resolveHomeAmount(amount: Money, options: FormatMoneyOptions): Money {
  if (!options.home) {
    throw new DomainError('VALIDATION', { reason: 'home_currency_required', mode: options.mode });
  }
  if (amount.currency === options.home) {
    return amount;
  }
  if (!options.converted) {
    throw new DomainError('VALIDATION', {
      reason: 'converted_amount_required',
      mode: options.mode,
    });
  }
  if (options.converted.currency !== options.home) {
    throw new DomainError('VALIDATION', {
      reason: 'converted_currency_mismatch',
      expected: options.home,
      actual: options.converted.currency,
    });
  }
  return options.converted;
}

/**
 * `mode: 'local'` shows `amount` as-is, in `locale`. `'home'` shows the home-currency equivalent
 * (`amount` itself if already in `home`, otherwise `options.converted`), in `homeLocale`. `'both'`
 * shows both, joined by "≈" (docs/product-decisions.md §3n-8: "Rp 75.000 ≈ S$6.40" — the IDR side in
 * `id-ID`, the SGD side in `en-SG`).
 */
export function formatMoney(amount: Money, options: FormatMoneyOptions): string {
  const roundingMode = options.roundingMode ?? 'half_even';
  const homeLocale = options.homeLocale ?? options.locale;
  const primary = formatSingle(amount, options.locale, roundingMode);

  if (options.mode === 'local') {
    return primary;
  }

  const homeAmount = resolveHomeAmount(amount, options);
  if (options.mode === 'home') {
    return formatSingle(homeAmount, homeLocale, roundingMode);
  }

  if (homeAmount.currency === amount.currency) {
    return primary;
  }
  return `${primary} ≈ ${formatSingle(homeAmount, homeLocale, roundingMode)}`;
}
