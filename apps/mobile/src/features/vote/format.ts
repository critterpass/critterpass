/**
 * The vote feature's small formatters: a poll deadline ("closes Fri", "closes in 2h"), prices from
 * the tools ("$412"), flight hours, month names, and guide identities for places.
 */
import { formatNarrowCurrency } from '@cp/cost-engine';
import { format } from '@cp/i18n';

import { guideColour, isGuideStickerId } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';

export function guideOr(value: string | null | undefined, fallback: GuideId = 'tokek'): GuideId {
  return isGuideStickerId(value) ? value : fallback;
}

export { guideColour };

/** Uppercases in the reader's language (Vietnamese keeps its diacritics). */
export function upper(text: string, locale: string): string {
  return text.toLocaleUpperCase(locale);
}

export type DeadlineParts =
  | { readonly kind: 'hours'; readonly hours: number }
  | { readonly kind: 'day'; readonly day: string }
  | { readonly kind: 'past' };

/** How far off a deadline is: hours when under a day, else the weekday, in the reader's zone. */
export function deadlineParts(locale: string, closesAt: string, now: Date): DeadlineParts {
  const at = new Date(closesAt);
  const ms = at.getTime() - now.getTime();
  if (ms <= 0) return { kind: 'past' };
  if (ms < 24 * 60 * 60 * 1000)
    return { kind: 'hours', hours: Math.max(1, Math.ceil(ms / 3_600_000)) };
  return { kind: 'day', day: format.date(locale, at, { weekday: 'short' }) };
}

/** "$412" in the currency's own digits, no decimals. */
export function money(locale: string, amountMinor: number, currency: string): string {
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return formatNarrowCurrency(locale, Math.round(amountMinor / 10 ** digits), currency, {
    maximumFractionDigits: 0,
  });
}

/** "Apr" for month 4. */
export function monthShort(locale: string, month: number): string {
  return format.date(locale, new Date(Date.UTC(2026, month - 1, 15)), {
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Whole hours for flight minutes (at least one). */
export function flightHours(minutes: number): number {
  return Math.max(1, Math.round(minutes / 60));
}
