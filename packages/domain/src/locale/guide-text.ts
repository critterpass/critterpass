/**
 * Guide-written shared text in each reader's language. The guide writes in the source language
 * (English); the row that holds the text also holds its translations in a nullable `i18n` JSON
 * column, so they inherit the row's own access rules and sync:
 *
 *   {"vi": {"notes": "…"}, "ja": {"notes": "…"}, "_src": "<hash of the source fields>"}
 *
 * A reader whose language is the source language, or has no translation, or whose translation was
 * made from other words than the row now carries (`_src` no longer matches, e.g. someone edited
 * the text), reads the source text. The server (which writes `i18n`) and the app (which reads it)
 * both go through this module, so "stale" means the same thing on both sides.
 */
import { z } from 'zod';

import { SOURCE_APP_LOCALE } from './app-locale';

export const GUIDE_TEXT_KINDS = [
  'plan_day',
  'plan_item',
  'briefing_item',
  'quest',
  'pitch',
] as const;
export type GuideTextKind = (typeof GUIDE_TEXT_KINDS)[number];

export interface GuideTextFieldSpec {
  readonly name: string;
  /** The source field's own limit, in characters (what its surface was designed to show). */
  readonly max: number;
  /** A heading shown on one line: its translation should be about as long as the original. */
  readonly title?: boolean;
}

/** How much longer than its source a translation may run once it is past the field's limit. */
export const GUIDE_TEXT_GROWTH = 1.4;

/**
 * The longest translation of `source` that is stored for `field`: anything within the field's own
 * limit, and past it only up to 1.4 times the source's length (the same line usually runs a little
 * longer outside English; much longer means the surface no longer fits it, so the source stays).
 */
export function guideTextLimit(field: GuideTextFieldSpec, source: string): number {
  return Math.max(field.max, Math.ceil(source.length * GUIDE_TEXT_GROWTH));
}

/**
 * The translatable fields of each kind, in hash order. A pitch's fields are read out of
 * `pitches.sections` (`pitchGuideTextSource`); the others are columns of the row.
 */
export const GUIDE_TEXT_FIELDS = {
  plan_day: [{ name: 'theme', max: 80, title: true }],
  plan_item: [{ name: 'notes', max: 240 }],
  briefing_item: [{ name: 'text', max: 140 }],
  quest: [
    { name: 'title', max: 24, title: true },
    { name: 'body', max: 110 },
  ],
  pitch: [
    { name: 'headline', max: 60, title: true },
    { name: 'reason_0', max: 90 },
    { name: 'reason_1', max: 90 },
    { name: 'reason_2', max: 90 },
    { name: 'quote', max: 110 },
  ],
} as const satisfies Record<GuideTextKind, readonly GuideTextFieldSpec[]>;

export type GuideTextField<K extends GuideTextKind> = (typeof GUIDE_TEXT_FIELDS)[K][number]['name'];

/** The source text of a row's translatable fields (absent and empty both mean "no text"). */
export type GuideTextSource = Readonly<Record<string, string | null | undefined>>;

export const GUIDE_TEXT_SRC_KEY = '_src';

/** A row's `i18n` value: per-language field text, plus the hash of the source it was made from. */
export type GuideTextI18n = Readonly<Record<string, unknown>>;

/**
 * 53-bit string hash (cyrb53) over UTF-16 code units: the same digits on the server and on the
 * phone's JS engine, which is all it has to be. Not a security boundary.
 */
function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The `_src` value for a row of `kind` carrying `source` right now. */
export function guideTextSourceHash(kind: GuideTextKind, source: GuideTextSource): string {
  return hash53(GUIDE_TEXT_FIELDS[kind].map((field) => source[field.name] ?? '').join('\u0000'));
}

/** `i18n` as stored (an object) or as synced to the phone (JSON text); anything else is null. */
export function parseGuideTextI18n(value: unknown): GuideTextI18n | null {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as GuideTextI18n)
    : null;
}

/** Whether `i18n` was made from the text the row carries now. */
export function guideTextIsCurrent(
  kind: GuideTextKind,
  source: GuideTextSource,
  i18n: GuideTextI18n | null,
): boolean {
  return i18n !== null && i18n[GUIDE_TEXT_SRC_KEY] === guideTextSourceHash(kind, source);
}

/** The languages `i18n` holds a current translation of every non-empty source field in. */
export function guideTextLocales(
  kind: GuideTextKind,
  source: GuideTextSource,
  i18n: GuideTextI18n | null,
): string[] {
  if (i18n === null || !guideTextIsCurrent(kind, source, i18n)) return [];
  const wanted = GUIDE_TEXT_FIELDS[kind].filter((field) => (source[field.name] ?? '') !== '');
  return Object.keys(i18n).filter((locale) => {
    if (locale === GUIDE_TEXT_SRC_KEY) return false;
    const fields = i18n[locale];
    if (typeof fields !== 'object' || fields === null) return false;
    return wanted.every((field) => field.name in fields);
  });
}

/**
 * The text of `field` as `locale` reads it: the translation when there is a current one, else the
 * source text exactly as stored.
 */
export function guideText<K extends GuideTextKind>(
  kind: K,
  source: GuideTextSource,
  i18n: unknown,
  field: GuideTextField<K>,
  locale: string,
): string | null {
  const original = source[field] ?? null;
  if (original === null || original === '' || locale === SOURCE_APP_LOCALE) return original;
  const parsed = parseGuideTextI18n(i18n);
  if (parsed === null || !guideTextIsCurrent(kind, source, parsed)) return original;
  const fields = parsed[locale];
  if (typeof fields !== 'object' || fields === null) return original;
  const translated = (fields as Record<string, unknown>)[field];
  return typeof translated === 'string' && translated !== '' ? translated : original;
}

/** A pitch's translatable text, read out of `pitches.sections`. */
export function pitchGuideTextSource(sections: {
  readonly headline?: string | null | undefined;
  readonly reasons?: readonly { readonly text: string }[] | undefined;
  readonly quote?: string | null | undefined;
}): GuideTextSource {
  const reasons = sections.reasons ?? [];
  return {
    headline: sections.headline ?? null,
    reason_0: reasons[0]?.text ?? null,
    reason_1: reasons[1]?.text ?? null,
    reason_2: reasons[2]?.text ?? null,
    quote: sections.quote ?? null,
  };
}

/**
 * `guide_text.translate`: brings the guide-written text of one trip (its live plan versions, the
 * members' briefings from today on, its open quests) or of one crew (its pitches) up to date in
 * every language its readers use. Safe to send as often as anything changes: it only translates
 * what is missing.
 */
export const guideTextTranslateJobSchema = z.union([
  z.strictObject({ trip_id: z.uuid() }),
  z.strictObject({ crew_id: z.uuid() }),
]);
export type GuideTextTranslateJob = z.infer<typeof guideTextTranslateJobSchema>;
