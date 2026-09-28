/* eslint-disable lingui/no-unlocalized-strings -- CSS variable names, locale tags and separators, not UI copy. */
/**
 * What an invite preview shows beyond its words: the guide sticker, the crew's member stubs, the
 * trip's dates and per-person estimate as chips, and the live countdown to the code's expiry.
 * Pure functions over the public preview, so the page and its tests agree.
 */
import { parseMemberColour, type LinkPreview } from '@cp/domain';

const GUIDE_KINDS: Readonly<Record<string, string>> = {
  tokek: 'gecko',
  pon: 'tanuki',
  lundi: 'puffin',
  ajo: 'axolotl',
  sardi: 'sardine',
  paco: 'alpaca',
};

/** The sticker for the trip's guide; Tokek (the brand default) when the trip has none. */
export function guideKind(slug: string | null | undefined): string {
  return (slug !== null && slug !== undefined ? GUIDE_KINDS[slug] : undefined) ?? 'gecko';
}

export interface MemberStub {
  readonly initial: string;
  readonly name: string;
  /** CSS colour for the avatar disc. */
  readonly colour: string;
  readonly ring: 'solid' | 'dashed' | 'double';
}

const ACCENT_VARS: Readonly<Record<string, string>> = {
  yellow: 'var(--color-yellow)',
  orange: 'var(--color-orange)',
  blue: 'var(--color-blue)',
  pink: 'var(--color-pink)',
  green: 'var(--color-green-base)',
  cream: 'var(--color-paper-warm)',
};

export function memberStubs(preview: LinkPreview | null): readonly MemberStub[] {
  return (preview?.members ?? []).map((member) => {
    const colour = parseMemberColour(member.colour);
    return {
      initial: (member.first_name.trim()[0] ?? '?').toLocaleUpperCase('en'),
      name: member.first_name,
      colour: ACCENT_VARS[colour?.accent ?? 'cream'] ?? 'var(--color-paper-warm)',
      ring: colour?.ring ?? 'solid',
    };
  });
}

/** "Oct 12–19", "Oct 30 – Nov 2"; null without both dates. Dates are local calendar days. */
export function tripDates(preview: LinkPreview | null, locale = 'en'): string | null {
  const start = preview?.trip_start ?? null;
  const end = preview?.trip_end ?? null;
  if (start === null || end === null) return null;
  const format = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return format.formatRange(new Date(`${start}T00:00:00Z`), new Date(`${end}T00:00:00Z`));
}

/** "$1,240": the per-person estimate in whole units of its currency; null when unknown. */
export function estimateEach(preview: LinkPreview | null, locale = 'en'): string | null {
  const minor = preview?.estimate_minor ?? null;
  const currency = preview?.estimate_currency ?? null;
  if (minor === null || currency === null) return null;
  const format = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  const exponent =
    new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return format.format(Math.round(minor / 10 ** exponent));
}

/** "3d 23:12:04" (days only when there are any); null once expired or without an expiry. */
export function countdownLabel(expiresAt: string | null | undefined, now: number): string | null {
  if (expiresAt === null || expiresAt === undefined) return null;
  const left = Math.floor((new Date(expiresAt).getTime() - now) / 1000);
  if (!(left > 0)) return null;
  const days = Math.floor(left / 86_400);
  const clock = [Math.floor((left % 86_400) / 3600), Math.floor((left % 3600) / 60), left % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
}
