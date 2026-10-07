/* eslint-disable lingui/no-unlocalized-strings -- CSS variable names, locale tags and separators, not UI copy. */
/**
 * What an invite preview shows beyond its words: the guide sticker, the crew's member stubs, the
 * trip's dates and per-person estimate as chips. Pure functions over the public preview, so the
 * page and its tests agree. Server only: it reads the critter catalogue, which no script sent to
 * a browser may import (the live countdown lives in ./countdown-label for that reason).
 */
import { canonicalSeed, critters, isGuideSpec } from '@cp/critter-art';
import { guideSlug } from '@cp/critter-art/guides';
import { parseMemberColour, type LinkPreview, type PublicProposal } from '@cp/domain';

const DEFAULT_KIND = 'gecko';
const DEFAULT_GUIDE_NAME = 'Tokek';
// Every critter is the guide of its own city, known by its name folded to a slug.
const CRITTERS_BY_SLUG = new Map(critters.map((critter) => [guideSlug(critter.name), critter]));

function critterOf(slug: string | null | undefined) {
  return slug === null || slug === undefined ? undefined : CRITTERS_BY_SLUG.get(slug);
}

/**
 * The sticker of the trip's guide where it is drawn on a canvas: the guide's own critter, with the
 * seed the dex draws it in. Tokek (the brand default) when the trip has no guide or one the dex
 * does not know.
 */
export function guideSticker(slug: string | null | undefined): {
  readonly kind: string;
  readonly seed: number | undefined;
} {
  const critter = critterOf(slug);
  return critter === undefined
    ? { kind: DEFAULT_KIND, seed: undefined }
    : { kind: critter.kind, seed: canonicalSeed(critter) };
}

/**
 * The guide's sticker where only a baked image can show (share cards): baked art exists for the
 * hand-drawn critters, so a guide drawn from the dex's parts shows Tokek there.
 */
export function guideKind(slug: string | null | undefined): string {
  const critter = critterOf(slug);
  return critter !== undefined && isGuideSpec(critter.spec) ? critter.kind : DEFAULT_KIND;
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

/** The guide's own name ("Tokek" when the trip has none or one the dex does not know). */
export function guideName(slug: string | null | undefined): string {
  return critterOf(slug)?.name ?? DEFAULT_GUIDE_NAME;
}

const DAY_TONES = ['green', 'orange', 'blue'] as const;

export interface DraftRow {
  readonly key: number;
  /** The day of the month, or null while the trip has no dates (the tile then says "Day n"). */
  readonly dayOfMonth: string | null;
  readonly weekday: string | null;
  readonly dayNo: number;
  /** The day's theme, else its first stop; null when the day has neither. */
  readonly title: string | null;
  /** The stops after the one used as the title. */
  readonly line: string | null;
  readonly tone: (typeof DAY_TONES)[number];
}

/** The invite ticket's draft rows: date tile, title and stops for each day shown. */
export function draftRows(proposal: PublicProposal, locale = 'en'): readonly DraftRow[] {
  const dayOfMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  return proposal.days.map((day, index) => {
    const date = day.date === null ? null : new Date(`${day.date}T00:00:00Z`);
    const title = day.theme ?? day.stops[0] ?? null;
    const rest = day.theme === null ? day.stops.slice(1) : day.stops;
    return {
      key: day.day_no,
      dayOfMonth: date === null ? null : dayOfMonth.format(date),
      weekday: date === null ? null : weekday.format(date),
      dayNo: day.day_no,
      title,
      line: rest.length > 0 ? rest.join(', ') : null,
      tone: DAY_TONES[index % DAY_TONES.length] ?? 'green',
    };
  });
}
