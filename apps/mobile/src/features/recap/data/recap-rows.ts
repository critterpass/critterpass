/**
 * The recap's synced rows as the local database returns them, and their jsonb columns read through
 * the domain's own schemas: a column that does not parse counts as missing, so the screen never
 * shows a number the builder did not write. The guide's words (card copy, award titles and lines)
 * come in the reader's language when a current translation is there, in English otherwise.
 */
/* eslint-disable lingui/no-unlocalized-strings -- language tags and column keys, never copy. */
import {
  AWARD_KINDS,
  guideText,
  RECAP_CARDS,
  recapAwardEvidenceSchema,
  recapCardsCopySchema,
  recapGuideTextSource,
  recapGotAwaySchema,
  recapReceiptSchema,
  recapRouteSchema,
  recapStatsSchema,
  RECAP_SECTIONS,
  RECAP_STATUSES,
  type AwardKind,
  type RecapAwardEvidence,
  type RecapCard,
  type RecapGotAway,
  type RecapReceipt,
  type RecapRoute,
  type RecapSection,
  type RecapStats,
  type RecapStatus,
} from '@cp/domain';

export interface RecapRow {
  readonly id: string;
  readonly status: string;
  readonly version: number | null;
  readonly stats: string | null;
  readonly route: string | null;
  readonly receipt: string | null;
  readonly got_away: string | null;
  readonly cards: string | null;
  readonly changed_sections: string | null;
  readonly failure_reason: string | null;
  /** The guide's words in other languages (guide-text translations). */
  readonly i18n?: string | null;
  /** Recorded narration: locale → card → {media_key, hash}. */
  readonly narration?: string | null;
  readonly mvp_closed_at?: string | null;
}

export interface AwardRow {
  readonly id: string;
  readonly user_id: string;
  readonly kind: string;
  readonly value: number | null;
  readonly evidence: string | null;
  readonly title: string | null;
  readonly line: string | null;
  readonly opted_out: number | null;
  readonly is_mvp: number | null;
  readonly name: string | null;
  readonly i18n?: string | null;
}

export interface FormRow {
  readonly id: string;
  readonly rarity: string;
  readonly palette: string | null;
  readonly pose: string | null;
  readonly edge: string | null;
  readonly critter_key: string;
  readonly city: string | null;
  readonly canonical_seed: number | null;
}

export interface RecapContent {
  readonly status: RecapStatus;
  readonly version: number;
  readonly stats: RecapStats | null;
  readonly route: RecapRoute | null;
  readonly receipt: RecapReceipt | null;
  readonly gotAway: RecapGotAway | null;
  /** The guide's words per card in the reader's language; empty until written. */
  readonly copy: Readonly<Partial<Record<RecapCard, CardCopy>>>;
  /** Recorded narration media keys per card, in the reader's language, else English. */
  readonly narration: Readonly<Partial<Record<RecapCard, string>>>;
  readonly changed: readonly RecapSection[];
  readonly failureReason: string | null;
  /** The MVP vote has closed (72 h after ready, or everyone voted). */
  readonly mvpClosed: boolean;
}

export interface CardCopy {
  readonly narration: string | null;
  readonly headline: string | null;
  readonly line: string | null;
}

export interface RecapAward {
  readonly id: string;
  readonly userId: string;
  readonly kind: AwardKind;
  readonly value: number;
  readonly evidence: RecapAwardEvidence;
  readonly title: string | null;
  readonly line: string | null;
  readonly optedOut: boolean;
  readonly mvp: boolean;
  readonly name: string;
}

/** The slice of a zod schema this reads through (the app does not depend on zod itself). */
interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

function parsed<T>(schema: Parser<T>, text: string | null): T | null {
  if (text === null) return null;
  try {
    const result = schema.safeParse(JSON.parse(text) as unknown);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** A Postgres text[] as PowerSync syncs it: a JSON array, or the `{a,b}` literal. */
function textArray(text: string | null): readonly string[] {
  if (text === null || text === '') return [];
  if (text.startsWith('[')) {
    try {
      const value = JSON.parse(text) as unknown;
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return text
    .replace(/^\{|\}$/gu, '')
    .split(',')
    .map((part) => part.replace(/^"|"$/gu, '').trim())
    .filter((part) => part !== '');
}

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

function json(text: string | null | undefined): unknown {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function copyOf(row: RecapRow, locale: string): Partial<Record<RecapCard, CardCopy>> {
  const cards = parsed(recapCardsCopySchema, row.cards ?? null) ?? {};
  const source = recapGuideTextSource(cards);
  const copy: Partial<Record<RecapCard, CardCopy>> = {};
  for (const card of RECAP_CARDS) {
    if (cards[card] === undefined) continue;
    const word = (part: 'narration' | 'headline' | 'line') =>
      guideText('recap', source, row.i18n ?? null, `${card}_${part}`, locale);
    copy[card] = { narration: word('narration'), headline: word('headline'), line: word('line') };
  }
  return copy;
}

/** The narration keys for `locale`, else English, else none (the story reads its text instead). */
function narrationOf(row: RecapRow, locale: string): Partial<Record<RecapCard, string>> {
  const all = json(row.narration);
  if (typeof all !== 'object' || all === null) return {};
  const byLocale = all as Record<string, unknown>;
  const keys: Partial<Record<RecapCard, string>> = {};
  for (const card of RECAP_CARDS) {
    for (const tag of [locale, 'en']) {
      const entry = (byLocale[tag] as Record<string, unknown> | undefined)?.[card];
      const key = (entry as { media_key?: unknown } | undefined)?.media_key;
      if (typeof key === 'string' && key !== '') {
        keys[card] = key;
        break;
      }
    }
  }
  return keys;
}

export function readRecap(row: RecapRow, locale = 'en'): RecapContent {
  const status = isOneOf(RECAP_STATUSES, row.status) ? row.status : 'queued';
  return {
    status,
    version: row.version ?? 1,
    stats: parsed(recapStatsSchema, row.stats),
    route: parsed(recapRouteSchema, row.route),
    receipt: parsed(recapReceiptSchema, row.receipt),
    gotAway: parsed(recapGotAwaySchema, row.got_away),
    copy: copyOf(row, locale),
    narration: narrationOf(row, locale),
    changed: textArray(row.changed_sections).filter((s): s is RecapSection =>
      isOneOf(RECAP_SECTIONS, s),
    ),
    failureReason: row.failure_reason,
    mvpClosed: (row.mvp_closed_at ?? null) !== null,
  };
}

export function readAward(row: AwardRow, locale = 'en'): RecapAward | null {
  if (!isOneOf(AWARD_KINDS, row.kind)) return null;
  const words = { title: row.title, line: row.line };
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    value: row.value ?? 0,
    evidence: parsed(recapAwardEvidenceSchema, row.evidence) ?? {},
    title: guideText('recap_award', words, row.i18n ?? null, 'title', locale),
    line: guideText('recap_award', words, row.i18n ?? null, 'line', locale),
    optedOut: row.opted_out === 1,
    mvp: row.is_mvp === 1,
    name: row.name ?? '',
  };
}
