/**
 * ISO 4217 currency table as data (docs/code-standards.md §2 "Money: integer minor units + ISO
 * currency ... never floats"). `exponent` is the number of digits
 * after the decimal point the ISO standard defines for that currency's minor unit — the only value
 * `packages/cost-engine/src/money/money.ts` uses to turn a bigint `amountMinor` into major units.
 * There is deliberately no "else 2" fallback anywhere in this module: a code absent from
 * `ISO_CURRENCIES` is unsupported and every lookup throws, so a typo or a decommissioned/precious
 * metal/fund code can never silently be treated as a 2-decimal currency.
 *
 * `symbol`/`narrowSymbol` cover the currencies Critterpass actually renders (launch destinations,
 * common home markets); every other currency falls back to its ISO code as both fields, which is
 * also what CLDR does once a locale has no dedicated glyph for a currency.
 */
import { DomainError } from '@cp/domain';

export interface CurrencyDefinition {
  /** ISO 4217 alpha-3 code. */
  readonly code: string;
  /** ISO 4217 minor-unit exponent: how many digits of `amountMinor` are the fractional part. */
  readonly exponent: number;
  /** Common display symbol (may be shared with other currencies, e.g. "$"). */
  readonly symbol: string;
  /** Narrow/short symbol for compact contexts; equals `symbol` when there is no shorter form. */
  readonly narrowSymbol: string;
}

function currency(
  code: string,
  exponent: number,
  symbol = code,
  narrowSymbol = symbol,
): CurrencyDefinition {
  return { code, exponent, symbol, narrowSymbol };
}

/** Currencies with 3-digit ISO 4217 minor units. */
const THREE_DECIMAL = ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'] as const;

/** Currencies with a 4-digit ISO 4217 minor unit (funds/inflation-indexed units). */
const FOUR_DECIMAL = ['CLF', 'UYW'] as const;

/**
 * Currencies with a 0-digit ISO 4217 minor unit — includes JPY/VND/KRW and ISK, whose minor unit
 * moved from 2 to 0 in the 2021 ISO 4217 amendment (the Icelandic króna no longer subdivides into
 * aurar).
 */
const ZERO_DECIMAL = [
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
] as const;

/** Currencies Critterpass gives an explicit, disambiguated symbol. */
const NAMED_SYMBOLS: Readonly<Record<string, readonly [symbol: string, narrow: string]>> = {
  USD: ['US$', '$'],
  EUR: ['€', '€'],
  GBP: ['£', '£'],
  JPY: ['¥', '¥'],
  CNY: ['CN¥', '¥'],
  HKD: ['HK$', '$'],
  TWD: ['NT$', 'NT$'],
  SGD: ['S$', '$'],
  MYR: ['RM', 'RM'],
  IDR: ['Rp', 'Rp'],
  THB: ['฿', '฿'],
  PHP: ['₱', '₱'],
  VND: ['₫', '₫'],
  KRW: ['₩', '₩'],
  INR: ['₹', '₹'],
  AUD: ['A$', '$'],
  NZD: ['NZ$', '$'],
  CAD: ['C$', '$'],
  CHF: ['CHF', 'CHF'],
  ISK: ['kr', 'kr'],
  AED: ['AED', 'AED'],
  SEK: ['kr', 'kr'],
  NOK: ['kr', 'kr'],
  DKK: ['kr', 'kr'],
};

/**
 * Every other currently-circulating ISO 4217 code Critterpass may plausibly touch (trip currencies,
 * home countries, FX cross rates). Precious-metal (XAU...), SDR (XDR) and fund codes are
 * intentionally absent: Critterpass never handles them, so a caller passing one gets the same
 * "unknown currency" error as a typo, which is the correct behaviour either way.
 */
const TWO_DECIMAL = [
  'AED',
  'AFN',
  'ALL',
  'AMD',
  'ANG',
  'AOA',
  'ARS',
  'AUD',
  'AWG',
  'AZN',
  'BAM',
  'BBD',
  'BDT',
  'BGN',
  'BMD',
  'BND',
  'BOB',
  'BRL',
  'BSD',
  'BTN',
  'BWP',
  'BYN',
  'BZD',
  'CAD',
  'CDF',
  'CHF',
  'CNY',
  'COP',
  'CRC',
  'CUP',
  'CVE',
  'CZK',
  'DKK',
  'DOP',
  'DZD',
  'EGP',
  'ERN',
  'ETB',
  'EUR',
  'FJD',
  'FKP',
  'GBP',
  'GEL',
  'GHS',
  'GIP',
  'GMD',
  'GTQ',
  'GYD',
  'HKD',
  'HNL',
  'HRK',
  'HTG',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'IRR',
  'JMD',
  'KES',
  'KGS',
  'KHR',
  'KPW',
  'KYD',
  'KZT',
  'LAK',
  'LBP',
  'LKR',
  'LRD',
  'LSL',
  'MAD',
  'MDL',
  'MGA',
  'MKD',
  'MMK',
  'MNT',
  'MOP',
  'MRU',
  'MUR',
  'MVR',
  'MWK',
  'MXN',
  'MYR',
  'MZN',
  'NAD',
  'NGN',
  'NIO',
  'NOK',
  'NPR',
  'NZD',
  'PAB',
  'PEN',
  'PGK',
  'PHP',
  'PKR',
  'PLN',
  'QAR',
  'RON',
  'RSD',
  'RUB',
  'SAR',
  'SBD',
  'SCR',
  'SDG',
  'SEK',
  'SGD',
  'SHP',
  'SLE',
  'SOS',
  'SRD',
  'SSP',
  'STN',
  'SVC',
  'SYP',
  'SZL',
  'THB',
  'TJS',
  'TMT',
  'TOP',
  'TRY',
  'TTD',
  'TWD',
  'TZS',
  'UAH',
  'USD',
  'UYU',
  'UZS',
  'VES',
  'WST',
  'XCD',
  'YER',
  'ZAR',
  'ZMW',
  'ZWL',
] as const;

function namedSymbolFor(code: string): readonly [symbol: string, narrow: string] {
  return NAMED_SYMBOLS[code] ?? [code, code];
}

/** ISO 4217 table, keyed by alpha-3 code; `CurrencyCode` is derived from these exact keys. */
export const ISO_CURRENCIES: Readonly<Record<string, CurrencyDefinition>> = Object.fromEntries(
  [
    ...THREE_DECIMAL.map((code) => currency(code, 3, ...namedSymbolFor(code))),
    ...FOUR_DECIMAL.map((code) => currency(code, 4, ...namedSymbolFor(code))),
    ...ZERO_DECIMAL.map((code) => currency(code, 0, ...namedSymbolFor(code))),
    ...TWO_DECIMAL.map((code) => currency(code, 2, ...namedSymbolFor(code))),
  ].map((definition) => [definition.code, definition] as const),
);

export type CurrencyCode = keyof typeof ISO_CURRENCIES;

/**
 * Cash-practice overrides for display only: IDR's ISO exponent is 2, but nobody prices in sen, so
 * the formatter rounds to whole rupiah. ISK is listed here too, even though its ISO exponent
 * already is 0, so every consumer can use the same
 * `displayDecimals(code) ?? exponent(code)` lookup without special-casing either currency.
 */
export const DISPLAY_DECIMAL_OVERRIDES: Readonly<Partial<Record<CurrencyCode, number>>> = {
  IDR: 0,
  ISK: 0,
};

export function isKnownCurrency(code: string): code is CurrencyCode {
  return Object.hasOwn(ISO_CURRENCIES, code);
}

/** Validates a raw string at a system boundary and narrows it to `CurrencyCode`; unknown code throws. */
export function assertCurrencyCode(code: string): CurrencyCode {
  if (!isKnownCurrency(code)) {
    throw new DomainError('VALIDATION', { reason: 'unknown_currency', code });
  }
  return code;
}

/**
 * `ISO_CURRENCIES` is built from `Object.fromEntries`, so TypeScript sees a plain string index
 * signature and (correctly, under `noUncheckedIndexedAccess`) cannot statically prove that every
 * `CurrencyCode` key resolves. It always does, by construction (`CurrencyCode` is `keyof typeof
 * ISO_CURRENCIES`); this helper makes that one assumption explicit and throws loudly instead of
 * reaching for a non-null assertion if it is ever wrong.
 */
function lookup(code: CurrencyCode): CurrencyDefinition {
  const definition = ISO_CURRENCIES[code];
  if (!definition) {
    throw new DomainError('INTERNAL', { reason: 'missing_currency_definition', code });
  }
  return definition;
}

export function currencyExponent(code: CurrencyCode): number {
  return lookup(code).exponent;
}

/** Decimal places to *display*; falls back to the ISO exponent when there is no cash-practice override. */
export function displayDecimals(code: CurrencyCode): number {
  return DISPLAY_DECIMAL_OVERRIDES[code] ?? currencyExponent(code);
}

export function currencySymbol(
  code: CurrencyCode,
  variant: 'symbol' | 'narrow' = 'symbol',
): string {
  const definition = lookup(code);
  return variant === 'narrow' ? definition.narrowSymbol : definition.symbol;
}
