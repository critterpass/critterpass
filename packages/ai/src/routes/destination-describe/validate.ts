/**
 * Checks of a facts-only destination text: each language has a line of at most 90 characters and
 * an about text of at most 400, and every number or year in them is one the facts hold. A text
 * that fails is not stored, so a reader never sees an invented population, height or date.
 */
import { z } from 'zod';

export const LINE_MAX = 90;
export const ABOUT_MAX = 400;
export const DESCRIBE_LOCALES = ['en', 'vi'] as const;
export type DescribeLocale = (typeof DESCRIBE_LOCALES)[number];

const textSchema = z.object({ line: z.string(), about: z.string() });
export const describeReplySchema = z.object({ en: textSchema, vi: textSchema });
export type DescribeReply = z.infer<typeof describeReplySchema>;

export interface DestinationFacts {
  readonly name: string;
  readonly local_name: string | null;
  readonly kind: string;
  readonly country: string;
  readonly region: string | null;
  readonly population: number | null;
  readonly elevation_m: number | null;
}

/** Digit runs with their group separators removed: `210,000`, `210.000` and `210 000` → `210000`. */
export function textNumbers(text: string): string[] {
  return (text.match(/\d+(?:[.,\s]\d{3}(?!\d))*/gu) ?? []).map((run) => run.replace(/\D/gu, ''));
}

/** Every number the facts allow: their numeric values and any digits in their names. */
export function factNumbers(facts: DestinationFacts): Set<string> {
  const values = [facts.population, facts.elevation_m].flatMap((n) =>
    n === null ? [] : [String(Math.round(n))],
  );
  const named = [facts.name, facts.local_name ?? '', facts.region ?? '', facts.country].flatMap(
    textNumbers,
  );
  return new Set([...values, ...named]);
}

export type DescribeVerdict =
  | { readonly ok: true; readonly texts: Record<DescribeLocale, { line: string; about: string }> }
  | { readonly ok: false; readonly reason: string };

export function validateDescribeReply(
  reply: DescribeReply,
  facts: DestinationFacts,
): DescribeVerdict {
  const allowed = factNumbers(facts);
  const texts = {} as Record<DescribeLocale, { line: string; about: string }>;
  for (const locale of DESCRIBE_LOCALES) {
    const line = reply[locale].line.trim();
    const about = reply[locale].about.trim();
    if (line === '' || about === '') return { ok: false, reason: `${locale}_empty` };
    if (line.length > LINE_MAX) return { ok: false, reason: `${locale}_line_too_long` };
    if (about.length > ABOUT_MAX) return { ok: false, reason: `${locale}_about_too_long` };
    const invented = [...textNumbers(line), ...textNumbers(about)].find((n) => !allowed.has(n));
    if (invented !== undefined) return { ok: false, reason: `${locale}_number_not_in_facts` };
    texts[locale] = { line, about };
  }
  return { ok: true, texts };
}
