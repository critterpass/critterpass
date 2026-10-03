/** Language and currency's CURRENCY words, from the person's price display. */
import { ISO_CURRENCIES } from '@cp/cost-engine';
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';

import { convertMoney, fxAsOf, priceText, type MoneyDisplay } from '@/data/money/money-display';

/**
 * The 3n-8 sample: Rp 75.000 at Tirta Empul, in the person's mode; US$5.00 when the phone has no
 * rupiah rate yet (every phone has dollar rates), so BOTH always shows a pair.
 */
export const SAMPLE_MINOR = 7_500_000n;
export const SAMPLE_CURRENCY = 'IDR';
const FALLBACK_MINOR = 500n;
const FALLBACK_CURRENCY = 'USD';

function sampleText(display: MoneyDisplay, locale: string): string {
  const home = display.homeCurrency;
  const rupiah = priceText(SAMPLE_MINOR, SAMPLE_CURRENCY, locale, display);
  if (display.mode === 'local' || home === null || home === SAMPLE_CURRENCY) return rupiah;
  if (convertMoney({ amountMinor: SAMPLE_MINOR, currency: SAMPLE_CURRENCY }, home, display.fx)) {
    return rupiah;
  }
  return priceText(FALLBACK_MINOR, FALLBACK_CURRENCY, locale, display);
}

export function currencyLines(
  display: MoneyDisplay,
  locale: string,
  now: Date,
): {
  readonly homeLine: string | null;
  readonly homeSymbol: string | null;
  readonly sample: string;
  readonly ratesLine: string | null;
} {
  const home = display.homeCurrency;
  const homeLine =
    home === null
      ? null
      : display.homeFromAirport
        ? t({ id: 'you.currency.homeAirportLine', message: `${home} · from your home airport` })
        : t({ id: 'you.currency.homeChosenLine', message: `${home} · chosen by you` });
  const rates = fxAsOf(display, now);
  const day =
    rates.asOf === null
      ? ''
      : // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix, never copy.
        format.date(locale, new Date(`${rates.asOf}T12:00:00Z`), {
          day: 'numeric',
          month: 'short',
        });
  const ratesLine =
    display.mode === 'local'
      ? null
      : rates.asOf === null
        ? t({ id: 'you.currency.ratesNone', message: 'Rates come with your next sync.' })
        : rates.stale
          ? t({ id: 'you.currency.ratesStale', message: `Rates from ${day}` })
          : null;
  return {
    homeLine,
    homeSymbol: home === null ? null : (ISO_CURRENCIES[home]?.symbol ?? home),
    sample: sampleText(display, locale),
    ratesLine,
  };
}

/** Settings' row line: "English · prices in S$ and local", "English · prices in S$", "English". */
export function languageLine(language: string, display: MoneyDisplay): string {
  const home = display.homeCurrency;
  if (home === null || display.mode === 'local') return language;
  const symbol = ISO_CURRENCIES[home]?.symbol ?? home;
  return display.mode === 'both'
    ? t({ id: 'you.settings.languageBoth', message: `${language} · prices in ${symbol} and local` })
    : t({ id: 'you.settings.languageHome', message: `${language} · prices in ${symbol}` });
}
