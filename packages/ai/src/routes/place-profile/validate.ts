/**
 * Cite-or-drop and the second-source rule for a place profile. A fact stays only when its quote is
 * on the page it cites and every number it uses is in the quote; an entry fee or opening hours
 * also needs the place's own site, or DeepSeek's own web search agreeing on the amount or the
 * times. A prose line with a number no page holds is blanked. Nothing is repaired: a fact that
 * fails is dropped and recorded with its reason.
 */
import {
  PLACE_BEST_TIMES,
  PLACE_FACT_KINDS,
  PLACE_MEAL_ROLES,
  type PlaceBestTime,
  type PlaceFactKind,
  type PlaceMealRole,
  type PlaceProfileText,
} from '@cp/domain';
import { z } from 'zod';

import { isBlockedUrl } from '../../tools/blocked-domains';
import { amountsIn } from '../facts-research/validate';
import { timesInText } from '../hours-research/validate';
import { squash } from '../link-extract/validate';
import { allowedNumbersIn, ungroundedRecapNumbers } from '../recap/number-guard';
import { foldText } from '../search-parse/validate';
import type { ProfileLocale, ProfilePage } from './prompt';

const rawFactSchema = z.object({
  kind: z.enum(PLACE_FACT_KINDS),
  en: z.string(),
  vi: z.string().optional(),
  source_url: z.string(),
  quote: z.string(),
});
export type RawProfileFact = z.infer<typeof rawFactSchema>;

const linesSchema = z.object({ en: z.string(), vi: z.string().optional() });

const rawProfileSchema = z.object({
  decision: z.enum(['write', 'decline']),
  why_go: linesSchema,
  best_time: linesSchema,
  crowd: linesSchema,
  best_times: z.array(z.string()),
  visit_min: z.number(),
  meal_role: z.string(),
  dish: z.string().nullable(),
  facts: z.array(rawFactSchema).max(12),
});

/** What DeepSeek's own web search said about the place (./second-source.ts). */
export interface SecondSourceAnswer {
  readonly entry_fee: string | null;
  readonly hours: string | null;
  readonly closed_or_renovating: string | null;
}

export type SecondSourceVerdict = 'own_site' | 'agrees' | 'no' | 'n/a';

export interface KeptFact {
  readonly kind: PlaceFactKind;
  readonly source_url: string;
  readonly quote: string;
  readonly second_source: SecondSourceVerdict;
}

export interface DroppedFact {
  readonly kind: PlaceFactKind;
  readonly en: string;
  readonly source_url: string;
  readonly reason: string;
}

export type CheckedProfile =
  | { readonly decision: 'decline' }
  | { readonly decision: 'unreadable' }
  | {
      readonly decision: 'write';
      readonly texts: Readonly<Partial<Record<ProfileLocale, PlaceProfileText>>>;
      readonly bestTimes: readonly PlaceBestTime[];
      readonly visitMin: number;
      readonly mealRole: PlaceMealRole;
      readonly dish: string | null;
      readonly facts: readonly KeptFact[];
      readonly dropped: readonly DroppedFact[];
      readonly proseDropped: readonly string[];
    };

const FREE = /\bfree\b|mien phi/iu;
const CLOCK = /\d{1,2}\s*[:.h]\s*\d{2}|\d{1,2}\s*h(?![a-z\d])|\d{1,2}\s*[ap]\.?m\b/giu;

/** Numbers and clock times in `text` that `source` does not hold. */
export function profileUngroundedNumbers(text: string, source: string): string[] {
  const known = timesInText(source);
  const loose = [...timesInText(text)].filter((t) => !known.has(t)).map((t) => `${t} min`);
  const rest = text.replace(CLOCK, ' ');
  return [...loose, ...ungroundedRecapNumbers(rest, allowedNumbersIn(source))];
}

/** Why a fact fails cite-or-drop, or null when it holds. */
export function factProblem(fact: RawProfileFact, pages: readonly ProfilePage[]): string | null {
  if (isBlockedUrl(fact.source_url)) return 'blocked_source';
  const cited = pages.filter((p) => p.url === fact.source_url);
  if (cited.length === 0) return 'unknown_source';
  const quote = squash(fact.quote);
  if (quote.length < 8) return 'quote_too_short';
  if (!cited.some((p) => squash(`${p.title}\n${p.text}`).includes(quote))) {
    return 'quote_not_on_page';
  }
  if (fact.kind === 'entry') {
    const amounts = amountsIn(fact.en);
    if (amounts.size === 0) return FREE.test(foldText(fact.quote)) ? null : 'no_amount';
    const quoted = amountsIn(fact.quote);
    return [...amounts].some((a) => !quoted.has(a)) ? 'amount_not_in_quote' : null;
  }
  return profileUngroundedNumbers(fact.en, fact.quote).length > 0 ? 'number_not_in_quote' : null;
}

const CLOSURE = /\bclos(?:ed|ure|es)\b|renovat|dong cua|tu sua|trung tu|tam ngung/iu;

/**
 * Fees, hours and closures need a second source; dress and other know-before facts stand on their
 * quote alone.
 */
export function needsSecondSource(fact: Pick<RawProfileFact, 'kind' | 'en'>): boolean {
  if (fact.kind === 'entry' || fact.kind === 'hours') return true;
  return fact.kind === 'know' && CLOSURE.test(foldText(fact.en));
}

/** Whether a reply proposes anything the second search is asked about. */
export function wantsSecondSource(raw: unknown): boolean {
  const parsed = rawProfileSchema.safeParse(raw);
  return (
    parsed.success && parsed.data.decision === 'write' && parsed.data.facts.some(needsSecondSource)
  );
}

/** Whether the second search agrees with a fee (an amount in common, or both free) or hours. */
export function secondSourceAgrees(
  kind: PlaceFactKind,
  text: string,
  second: SecondSourceAnswer | null,
): boolean {
  if (second === null) return false;
  if (kind === 'entry') {
    const other = second.entry_fee ?? '';
    const ours = amountsIn(text);
    const theirs = amountsIn(other);
    if (ours.size === 0) return FREE.test(foldText(text)) && FREE.test(foldText(other));
    return [...ours].some((amount) => theirs.has(amount));
  }
  if (kind === 'hours') {
    const ours = timesInText(text);
    const theirs = timesInText(second.hours ?? '');
    const shared = [...ours].filter((t) => theirs.has(t)).length;
    return ours.size > 0 && shared >= Math.min(2, ours.size);
  }
  // A closure: the second search reports one too.
  return kind === 'know' && second.closed_or_renovating !== null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./u, '').toLowerCase();
  } catch {
    return null;
  }
}

/** True when `url` is on the place's own website (same host, or a subdomain of it). */
export function isOwnSite(url: string, website: string | null): boolean {
  if (website === null) return false;
  const own = hostOf(website);
  const cited = hostOf(url);
  return own !== null && cited !== null && (cited === own || cited.endsWith(`.${own}`));
}

export interface ProfileCheckInput {
  readonly pages: readonly ProfilePage[];
  readonly locales: readonly ProfileLocale[];
  /** The second search's answer; null when it was skipped or failed. */
  readonly second: SecondSourceAnswer | null;
  readonly website: string | null;
}

const asBestTimes = (values: readonly string[]): PlaceBestTime[] =>
  PLACE_BEST_TIMES.filter((t) => values.includes(t));

/** Checks one model reply against the pages it was given. */
export function checkPlaceProfileReply(raw: unknown, input: ProfileCheckInput): CheckedProfile {
  const parsed = rawProfileSchema.safeParse(raw);
  if (!parsed.success) return { decision: 'unreadable' };
  const reply = parsed.data;
  if (reply.decision === 'decline') return { decision: 'decline' };

  const facts: KeptFact[] = [];
  const factTexts: Record<string, string>[] = [];
  const dropped: DroppedFact[] = [];
  for (const fact of reply.facts.slice(0, 6)) {
    const missingLocale = input.locales.find((l) => (fact[l] ?? '').trim() === '');
    let reason = missingLocale === undefined ? factProblem(fact, input.pages) : 'missing_language';
    let verdict: SecondSourceVerdict = 'n/a';
    if (reason === null && needsSecondSource(fact)) {
      if (isOwnSite(fact.source_url, input.website)) verdict = 'own_site';
      else if (secondSourceAgrees(fact.kind, fact.en, input.second)) verdict = 'agrees';
      else reason = 'no_second_source';
    }
    if (reason !== null) {
      dropped.push({ kind: fact.kind, en: fact.en, source_url: fact.source_url, reason });
      continue;
    }
    facts.push({
      kind: fact.kind,
      source_url: fact.source_url,
      quote: fact.quote,
      second_source: verdict,
    });
    factTexts.push(Object.fromEntries(input.locales.map((l) => [l, fact[l] ?? ''])));
  }

  const source = input.pages.map((p) => p.text).join('\n');
  const proseDropped = (['why_go', 'best_time', 'crowd'] as const).filter(
    (key) => profileUngroundedNumbers(reply[key].en, source).length > 0,
  );
  const line = (key: 'why_go' | 'best_time' | 'crowd', locale: ProfileLocale) =>
    proseDropped.includes(key) ? '' : (reply[key][locale] ?? '');
  const texts = Object.fromEntries(
    input.locales.map((locale) => [
      locale,
      {
        why_go: line('why_go', locale),
        best_time: line('best_time', locale),
        crowd: line('crowd', locale),
        facts: factTexts.map((t) => t[locale] ?? ''),
      } satisfies PlaceProfileText,
    ]),
  );
  const mealRole = (PLACE_MEAL_ROLES as readonly string[]).includes(reply.meal_role)
    ? (reply.meal_role as PlaceMealRole)
    : 'none';
  return {
    decision: 'write',
    texts,
    bestTimes: asBestTimes(reply.best_times),
    visitMin: Math.min(600, Math.max(15, Math.round(reply.visit_min))),
    mealRole,
    dish: reply.dish === null || reply.dish.trim() === '' ? null : reply.dish.trim(),
    facts,
    dropped,
    proseDropped,
  };
}
