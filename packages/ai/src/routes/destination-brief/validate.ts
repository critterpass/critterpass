/**
 * Cite-or-drop for a destination brief. An essential or an eatery stays only when its quote is on
 * the page it cites and names the place; a stay band only when its quote is on the page and holds
 * both amounts. A `why` line with a number its page does not hold is blanked. Nothing is repaired:
 * whatever fails is dropped and recorded with its reason. Names are still leads after this: the
 * worker keeps one only when our own rows carry it.
 */
import { z } from 'zod';

import { isBlockedUrl } from '../../tools/blocked-domains';
import { amountsIn } from '../facts-research/validate';
import { squash } from '../link-extract/validate';
import { PLACE_PICK_KINDS, type NamedPlace } from '../place-picks';
import type { ProfileLocale, ProfilePage } from '../place-profile/prompt';
import { profileUngroundedNumbers } from '../place-profile/validate';
import { foldText } from '../search-parse/validate';
import { STAY_TIERS, type StayTier } from './prompt';

const linesSchema = z.record(z.string(), z.string());
const citedSchema = { source_url: z.string(), quote: z.string() };
const nameSchema = {
  name: z.string().trim().min(2).max(120),
  local_name: z.string().trim().max(120).nullish(),
  why: linesSchema,
};
const essentialSchema = z.object({
  ...nameSchema,
  ...citedSchema,
  kind: z.enum(PLACE_PICK_KINDS).catch('other'),
  area: z.string().trim().max(120).nullish(),
});
const eaterySchema = z.object({
  ...nameSchema,
  ...citedSchema,
  dish: z.string().trim().max(80).nullish(),
});
const staySchema = z.object({
  ...citedSchema,
  tier: z.enum(STAY_TIERS),
  low: z.number().nonnegative(),
  high: z.number().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/u),
});
const replySchema = z.object({
  decision: z.enum(['write', 'decline']),
  essentials: z.array(z.unknown()).default([]),
  eateries: z.array(z.unknown()).default([]),
  stays: z.array(z.unknown()).default([]),
});

/** The page and sentence a brief entry rests on. */
export interface BriefSource {
  readonly url: string;
  readonly title: string;
  readonly quote: string;
}

/** Lines per locale (`{en, vi}`); a blanked line is left out. */
export type BriefLines = Readonly<Record<string, string>>;

export interface BriefLead extends NamedPlace {
  readonly why: BriefLines;
  readonly source: BriefSource;
}

export interface BriefEateryLead extends BriefLead {
  readonly dish: string | null;
}

export interface StayBand {
  readonly tier: StayTier;
  readonly low: number;
  readonly high: number;
  readonly currency: string;
  readonly source: BriefSource;
}

export interface DroppedBriefEntry {
  readonly section: 'essentials' | 'eateries' | 'stays';
  readonly name: string;
  readonly reason: string;
}

export type CheckedBrief =
  | { readonly decision: 'decline' | 'unreadable' }
  | {
      readonly decision: 'write';
      readonly essentials: readonly BriefLead[];
      readonly eateries: readonly BriefEateryLead[];
      readonly stays: readonly StayBand[];
      readonly dropped: readonly DroppedBriefEntry[];
    };

/** The page a citation is on, or why it is not usable. */
export function citedPage(
  url: string,
  quote: string,
  pages: readonly ProfilePage[],
): ProfilePage | string {
  if (isBlockedUrl(url)) return 'blocked_source';
  const cited = pages.filter((p) => p.url === url);
  if (cited.length === 0) return 'unknown_source';
  const squashed = squash(quote);
  if (squashed.length < 8) return 'quote_too_short';
  return (
    cited.find((p) => squash(`${p.title}\n${p.text}`).includes(squashed)) ?? 'quote_not_on_page'
  );
}

/** True when the quote carries one of the place's own words (four letters or more). */
export function quoteNamesPlace(quote: string, names: readonly (string | null)[]): boolean {
  const folded = foldText(quote);
  return names.some((name) =>
    (foldText(name ?? '').match(/[\p{L}\p{N}]{4,}/gu) ?? []).some((word) => folded.includes(word)),
  );
}

/** Why a stay band fails its citation's amount check, or null when both amounts are quoted. */
export function stayProblem(band: Pick<StayBand, 'low' | 'high'>, quote: string): string | null {
  if (band.low <= 0 || band.high < band.low) return 'bad_range';
  const quoted = amountsIn(
    quote.replace(/\s*\bmillions?\b/giu, 'm').replace(/\s*\bthousand\b/giu, 'k'),
  );
  return quoted.has(band.low) && quoted.has(band.high) ? null : 'amount_not_in_quote';
}

function groundedLines(
  why: Record<string, string>,
  page: ProfilePage,
  locales: readonly ProfileLocale[],
): BriefLines {
  const out: Record<string, string> = {};
  for (const locale of locales) {
    const line = why[locale]?.trim() ?? '';
    if (line !== '' && profileUngroundedNumbers(line, page.text).length === 0) out[locale] = line;
  }
  return out;
}

const blankToNull = (value: string | null | undefined) =>
  value === null || value === undefined || value.trim() === '' ? null : value.trim();

export function checkDestinationBriefReply(
  raw: unknown,
  pages: readonly ProfilePage[],
  locales: readonly ProfileLocale[],
): CheckedBrief {
  const reply = replySchema.safeParse(raw);
  if (!reply.success) return { decision: 'unreadable' };
  if (reply.data.decision === 'decline') return { decision: 'decline' };
  const dropped: DroppedBriefEntry[] = [];
  const seen = new Set<string>();

  function lead(
    entry: z.infer<typeof essentialSchema> | z.infer<typeof eaterySchema>,
    section: 'essentials' | 'eateries',
  ) {
    const key = squash(entry.name);
    if (seen.has(key)) return null;
    seen.add(key);
    const page = citedPage(entry.source_url, entry.quote, pages);
    const localName = blankToNull(entry.local_name);
    const problem =
      typeof page === 'string'
        ? page
        : quoteNamesPlace(entry.quote, [entry.name, localName])
          ? null
          : 'quote_not_about_place';
    if (problem !== null || typeof page === 'string') {
      dropped.push({ section, name: entry.name, reason: problem ?? 'unknown_source' });
      return null;
    }
    return {
      name: entry.name,
      localName: localName === entry.name ? null : localName,
      why: groundedLines(entry.why, page, locales),
      source: { url: page.url, title: page.title, quote: entry.quote.trim() },
    };
  }

  const essentials = reply.data.essentials.flatMap((item) => {
    const entry = essentialSchema.safeParse(item);
    if (!entry.success) return [];
    const kept = lead(entry.data, 'essentials');
    return kept === null
      ? []
      : [{ ...kept, kind: entry.data.kind, area: blankToNull(entry.data.area) }];
  });
  const eateries = reply.data.eateries.flatMap((item) => {
    const entry = eaterySchema.safeParse(item);
    if (!entry.success) return [];
    const kept = lead(entry.data, 'eateries');
    if (kept === null) return [];
    const kind = 'food' as const;
    return [{ ...kept, kind, area: null, dish: blankToNull(entry.data.dish) }];
  });
  const tiers = new Set<StayTier>();
  const stays = reply.data.stays.flatMap((item) => {
    const entry = staySchema.safeParse(item);
    if (!entry.success || tiers.has(entry.data.tier)) return [];
    const page = citedPage(entry.data.source_url, entry.data.quote, pages);
    const problem = typeof page === 'string' ? page : stayProblem(entry.data, entry.data.quote);
    if (problem !== null || typeof page === 'string') {
      dropped.push({ section: 'stays', name: entry.data.tier, reason: problem ?? 'unknown' });
      return [];
    }
    tiers.add(entry.data.tier);
    return [
      {
        tier: entry.data.tier,
        low: entry.data.low,
        high: entry.data.high,
        currency: entry.data.currency,
        source: { url: page.url, title: page.title, quote: entry.data.quote.trim() },
      },
    ];
  });
  return { decision: 'write', essentials, eateries, stays, dropped };
}
