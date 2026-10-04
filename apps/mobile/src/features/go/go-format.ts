/**
 * GO's numbers in the redesign's short forms: a duration of an hour or more as hours and minutes
 * ("1H44", like every section 7 time), and Grab's fare range in compact money with the symbol once
 * ("₫95K–120K", like the review's money chip). The words (K, M, B) come from the caller's catalog.
 */
import { currencyExponent, narrowCurrencySymbol } from '@cp/cost-engine';

export type DurationParts =
  | { readonly kind: 'minutes'; readonly minutes: number }
  | { readonly kind: 'hours'; readonly hours: number; readonly rest: string };

export function durationParts(minutes: number): DurationParts {
  if (minutes < 60) return { kind: 'minutes', minutes };
  return {
    kind: 'hours',
    hours: Math.floor(minutes / 60),
    rest: String(minutes % 60).padStart(2, '0'),
  };
}

export interface CompactUnits {
  readonly thousand: string;
  readonly million: string;
  readonly billion: string;
}

/** The step both ends share, picked from the high end, so the range reads in one unit. */
function step(
  major: number,
  units: CompactUnits,
): { readonly divisor: number; readonly unit: string } {
  if (major >= 1e9) return { divisor: 1e9, unit: units.billion };
  if (major >= 1e6) return { divisor: 1e6, unit: units.million };
  if (major >= 1e3) return { divisor: 1e3, unit: units.thousand };
  return { divisor: 1, unit: '' };
}

export function compactFareRange(
  range: { readonly lowMinor: number; readonly highMinor: number; readonly currency: string },
  locale: string,
  units: CompactUnits,
): string {
  const scale = 10 ** currencyExponent(range.currency);
  const low = range.lowMinor / scale;
  const high = range.highMinor / scale;
  const { divisor, unit } = step(high, units);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const symbol = narrowCurrencySymbol(range.currency);
  const lowText = `${number.format(low / divisor)}${unit}`;
  const highText = `${number.format(high / divisor)}${unit}`;
  return low === high ? `${symbol}${highText}` : `${symbol}${lowText}–${highText}`;
}
