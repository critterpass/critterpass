/**
 * The vote feature's small formatters: a poll deadline ("closes Fri", "closes in 2h"), prices from
 * the tools ("$412"), flight hours, month names, and guide identities for places.
 */
import { tokens } from '@cp/design-tokens';
import { format } from '@cp/i18n';

import type { GuideId } from '@/ui/people/GuideLine';

const GUIDES: readonly GuideId[] = ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco'];

export function guideOr(value: string | null | undefined, fallback: GuideId = 'tokek'): GuideId {
  return GUIDES.includes(value as GuideId) ? (value as GuideId) : fallback;
}

export function guideColour(guide: GuideId): string {
  return tokens.guide[guide];
}

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
  return format.number(locale, Math.round(amountMinor / 10 ** digits), {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
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
