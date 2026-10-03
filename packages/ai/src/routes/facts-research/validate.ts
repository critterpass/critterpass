/**
 * Code-side checks on a `facts.research` reply. Each fact must cite a page the search returned (a
 * dated page no older than `FACTS_FEE_MAX_AGE_DAYS` for a fee, `FACTS_SOURCE_MAX_AGE_DAYS` for the
 * rest) and quote a sentence that is on that page; an entry fee's every amount must be in the quote
 * ("Rp 75k" against "IDR 75,000") and its words too ("Free"); what to wear must use the quote's
 * words; a thing to know may use no number the quote lacks. A fact that fails is dropped, never
 * repaired; a reply left with none is a decline.
 */
import type { WebResult } from '../../tools/web-search';
import { allowedNumbersIn, ungroundedRecapNumbers } from '../recap/number-guard';
import { squash } from '../link-extract/validate';
import { foldText } from '../search-parse/validate';
import {
  factsResearchReplySchema,
  FACTS_DRESS_MAX,
  FACTS_ENTRY_MAX,
  FACTS_KNOW_COUNT,
  FACTS_KNOW_MAX,
  type SourcedFact,
} from './schema';

/**
 * Below this the model itself doubts the page; above it, each fact still stands or falls on its own
 * quote, and an operator approves every one before it is shown.
 */
export const FACTS_MIN_CONFIDENCE = 0.5;
/** Pages dated earlier than this are too old to trust for a fee, which changes most years. */
export const FACTS_FEE_MAX_AGE_DAYS = 400;
/** Dress rules and visiting tips change slowly; older pages than this are still too old. */
export const FACTS_SOURCE_MAX_AGE_DAYS = 1_100;

export interface CitedFact {
  readonly value: string;
  readonly sourceUrl: string;
  readonly fetchedAt: string;
}

export interface FactsProposal {
  readonly entry: CitedFact | null;
  readonly dress: CitedFact | null;
  readonly knowBefore: readonly CitedFact[];
  readonly confidence: number;
}

export type FactsCheck =
  | {
      readonly ok: true;
      readonly proposal: FactsProposal;
      /** Facts the model proposed that did not hold, with why. */
      readonly dropped: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

const MULTIPLIERS: Readonly<Record<string, number>> = {
  k: 1_000,
  rb: 1_000,
  nghin: 1_000,
  ngan: 1_000,
  tr: 1_000_000,
  trieu: 1_000_000,
  m: 1_000_000,
};

/** Every amount a text writes ("IDR 75,000", "75k", "75.000đ", "¥1,500", "1.5"), as numbers. */
export function amountsIn(text: string): Set<number> {
  const flat = foldText(text.normalize('NFKC'));
  const found = new Set<number>();
  const pattern =
    /(?<![\d.,])(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d{1,2})?)(?![\d])\s*(k|rb|nghin|ngan|tr|trieu|m)?(?![a-z])/gu;
  for (const match of flat.matchAll(pattern)) {
    const raw = match[1] ?? '';
    const factor = MULTIPLIERS[match[2] ?? ''] ?? 1;
    const grouped = /[.,\s]\d{3}$/u.test(raw) && /^\d{1,3}(?:[.,\s]\d{3})+$/u.test(raw);
    const whole = Number(raw.replace(/[.,\s]/gu, ''));
    if (grouped) found.add(whole * factor);
    const decimal = Number(raw.replace(/\s/gu, '').replace(',', '.'));
    if (!grouped && Number.isFinite(decimal)) found.add(decimal * factor);
    // "1.500" is 1500 in Vietnamese and Indonesian, 1.5 elsewhere: a page may mean either.
    if (grouped && /^\d{1,3}[.,]\d{3}$/u.test(raw))
      found.add(Number(raw.replace(',', '.')) * factor);
  }
  return found;
}

const FREE = /\bfree\b|no (?:entrance|admission|entry) fee|mien phi|無料|gratis|gratuit/iu;
const STOP = new Set(['and', 'the', 'for', 'per', 'adult', 'adults', 'person', 'entry', 'fee']);

/** Words of a short value the quote must also carry (folded, three letters or more). */
function wordsMissing(value: string, quote: string): string[] {
  const folded = foldText(quote);
  const words = foldText(value).match(/\p{L}{3,}/gu) ?? [];
  return words.filter((word) => !STOP.has(word) && !folded.includes(word));
}

function ageInDays(publishedAt: string | null, now: Date): number | null {
  if (publishedAt === null) return null;
  const at = Date.parse(publishedAt);
  return Number.isNaN(at) ? null : (now.getTime() - at) / 86_400_000;
}

type FactKind = 'entry' | 'dress' | 'know';

/** The reason a fact fails, or null when it holds. */
function factProblem(
  kind: FactKind,
  fact: SourcedFact,
  results: readonly WebResult[],
  now: Date,
): string | null {
  const value = fact.value.trim();
  const max =
    kind === 'entry' ? FACTS_ENTRY_MAX : kind === 'dress' ? FACTS_DRESS_MAX : FACTS_KNOW_MAX;
  if (value === '' || value.length > max) return 'length';
  const source = results.find((result) => result.url === fact.source_url);
  if (source === undefined) return 'unknown_source';
  const age = ageInDays(source.published_at, now);
  const maxAge = kind === 'entry' ? FACTS_FEE_MAX_AGE_DAYS : FACTS_SOURCE_MAX_AGE_DAYS;
  if (age !== null && age > maxAge) return 'stale_source';
  const quote = squash(fact.quote);
  if (quote.length < 8 || !squash(`${source.title}\n${source.snippet}`).includes(quote)) {
    return 'quote_not_in_source';
  }
  if (kind === 'know') {
    const allowed = allowedNumbersIn(fact.quote);
    return ungroundedRecapNumbers(value, allowed).length > 0 ? 'number_not_in_quote' : null;
  }
  if (kind === 'entry') {
    const amounts = amountsIn(value);
    if (amounts.size === 0 && !FREE.test(foldText(value))) return 'no_amount';
    if (amounts.size === 0 && !FREE.test(foldText(fact.quote))) return 'value_not_in_quote';
    const quoted = amountsIn(fact.quote);
    if ([...amounts].some((amount) => !quoted.has(amount))) return 'amount_not_in_quote';
    return null;
  }
  return wordsMissing(value, fact.quote).length > 0 ? 'value_not_in_quote' : null;
}

/** Checks one parsed reply against the search results it was written from. */
export function checkFactsReply(
  raw: unknown,
  results: readonly WebResult[],
  now: Date,
): FactsCheck {
  const parsed = factsResearchReplySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'shape' };
  const reply = parsed.data;
  if (reply.decision === 'decline') return { ok: false, reason: 'declined' };
  if (reply.confidence < FACTS_MIN_CONFIDENCE) return { ok: false, reason: 'low_confidence' };
  const dropped: string[] = [];
  const keep = (kind: FactKind, fact: SourcedFact | null): CitedFact | null => {
    if (fact === null) return null;
    const problem = factProblem(kind, fact, results, now);
    if (problem !== null) {
      dropped.push(`${kind}: ${problem}`);
      return null;
    }
    const source = results.find((result) => result.url === fact.source_url);
    return {
      value: fact.value.trim(),
      sourceUrl: fact.source_url,
      fetchedAt: source?.fetched_at ?? '',
    };
  };
  const entry = keep('entry', reply.entry);
  const dress = keep('dress', reply.dress);
  const knowBefore = reply.know_before
    .slice(0, FACTS_KNOW_COUNT)
    .map((fact) => keep('know', fact))
    .filter((fact): fact is CitedFact => fact !== null);
  if (entry === null && dress === null && knowBefore.length === 0) {
    return { ok: false, reason: dropped.length > 0 ? 'nothing_holds' : 'no_facts' };
  }
  return {
    ok: true,
    proposal: { entry, dress, knowBefore, confidence: reply.confidence },
    dropped,
  };
}
