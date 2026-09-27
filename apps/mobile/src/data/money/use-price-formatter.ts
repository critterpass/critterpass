/**
 * The app-wide price formatter (docs/product-decisions.md §3n-8): every screen renders money
 * through this hook so `user_settings.price_display` (home/local/both) and the disambiguated
 * currency symbols stay in exactly one place.
 *
 * `PriceFormatterSettings` mirrors the synced fields this hook will eventually read live:
 * `priceDisplay` already exists on `user_settings`; `homeCurrency` is derived from the user's home
 * airport country, a field that does not exist on the user profile yet, and the PowerSync client
 * this hook would read `user_settings` through is not wired up yet either. Both are real, scheduled
 * dependencies, not stubs: until they land, a screen passes the settings it already has (e.g. from
 * its own trip/user query) — the hook's contract does not change when the synced source is wired
 * in, only where `settings` comes from.
 */
import {
  formatCompactMoney,
  formatMoney,
  type CurrencyCode,
  type Money,
  type RoundingMode,
} from '@cp/cost-engine';
import { type PriceDisplayMode } from '@cp/domain';
import { useMemo } from 'react';

export interface PriceFormatterSettings {
  /** BCP-47 locale for an amount in its own (local/destination) currency. */
  readonly locale: string;
  /** BCP-47 locale for the home-currency side of 'home'/'both' mode; defaults to `locale`. */
  readonly homeLocale?: string;
  /** Mirrors `user_settings.price_display`. */
  readonly priceDisplay: PriceDisplayMode;
  /** The user's home currency; required whenever `priceDisplay` is 'home' or 'both'. */
  readonly homeCurrency?: CurrencyCode;
  readonly roundingMode?: RoundingMode;
}

export interface PriceFormatter {
  /** `converted` is `amount` already expressed in `homeCurrency`; required only when the two
   * currencies differ and `priceDisplay` needs the home side ('home' or 'both'). */
  format(amount: Money, converted?: Money): string;
  formatCompact(amount: Money): string;
}

/** Builds a `PriceFormatter` bound to the given settings, memoised so it stays referentially
 * stable across renders where the settings have not changed. */
export function usePriceFormatter(settings: PriceFormatterSettings): PriceFormatter {
  const { locale, homeLocale, priceDisplay, homeCurrency, roundingMode } = settings;

  return useMemo<PriceFormatter>(
    () => ({
      // Built with conditional spreads, not `key: possiblyUndefined`: exactOptionalPropertyTypes
      // treats an explicit `undefined` value differently from an absent key, and FormatMoneyOptions'
      // optional fields mean "absent", not "present and undefined".
      format: (amount, converted) =>
        formatMoney(amount, {
          locale,
          mode: priceDisplay,
          ...(homeLocale !== undefined ? { homeLocale } : {}),
          ...(homeCurrency !== undefined ? { home: homeCurrency } : {}),
          ...(converted !== undefined ? { converted } : {}),
          ...(roundingMode !== undefined ? { roundingMode } : {}),
        }),
      formatCompact: (amount) => formatCompactMoney(amount, { locale }),
    }),
    [locale, homeLocale, priceDisplay, homeCurrency, roundingMode],
  );
}
