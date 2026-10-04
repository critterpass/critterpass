/**
 * Checks on the editorial notes of a curated place, and the food names open data misfiles. A note
 * is written from a record's name, category and address, so it must not lean on what the open
 * data cannot back: a comparison with the other places on its list, the meaning of a name, a
 * superlative or a date.
 */
import type { ContentItem } from '@cp/content';

/**
 * A name that opens with a dish or a kind of eatery ("Phở 126", "Quán bánh canh Phan Rang",
 * "Gạo Coffee"): open data files many of these under its catch-all category. Accents are kept,
 * since "gà" is chicken and "ga" a station.
 */
const FOOD_NAME =
  /^(quán |tiệm |nhà hàng )?(bánh|banh|phở|pho|bún|bun|lẩu|lau|cơm|cháo|mì|hủ tiếu|hủ tíu|nem|chè|kem|sữa|yaourt|xôi|ốc|bò|gà|vịt|dê|miến|cà phê|ca phe|cafe|café|coffee|bia|buffet|bbq|pizza|restaurant|dimsum)(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(cafe|café|coffee|cà phê|restaurant|quán ăn|nhà hàng|bakery|bistro)$/u;

export function namedFood(name: string): boolean {
  return FOOD_NAME.test(name.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim());
}

/**
 * A note that leans on the other places of its list ("another palace", "quieter than Palace II"):
 * the writer sees fifteen places at once and nothing in the open data backs the comparison, so
 * the unit is written again.
 */
const COMPARES = /\b(another|a second|alternative)\b/iu;
const COMPARES_WITH =
  /\bthan (?:(?:the )?other|nearby|most|many|major|main|central|\p{Lu})|\bcompared (?:to|with)\b/u;
export const standsAlone = (text: string) => !COMPARES.test(text) && !COMPARES_WITH.test(text);
export const ALONE = 'the note compares the place with another';
/** Superlatives and dates: claims the name, category and address cannot support. */
const CLAIMS =
  /\bone of [^.;]*\b(largest|biggest|oldest|tallest|highest|best|finest)\b|\b(the|'s) (largest|biggest|oldest|tallest|highest|first)\b|\b(1[5-9]|20)\d{2}s?\b|\b\d{1,2}(st|nd|rd|th)[- ]century\b/iu;

export function unsupportedClaim(poi: ContentItem<'places'>): string | null {
  const { why_go, best_time, crowd_hint } = poi.editorial;
  return CLAIMS.exec(`${why_go} ${best_time} ${crowd_hint}`)?.[0] ?? null;
}

/**
 * A note that takes its content from what a name means or sounds like ("a stop whose name suggests
 * a dreamy atmosphere"): the name says what a place is called, not what it is like.
 */
const READS_NAME =
  /\bnames? (suggests?|impl(y|ies)|hints?|evokes?|means?|translates?|promises?|says)\b|\b(whose|its|the|with a|with an|a|an) (\w+ )?name\b[^.;]*\b(suggest|impl|hint|evok|mean|translat|promis)|\b(memorable|playful|whimsical|evocative|quirky|poetic|dreamy|charming|curious|catchy|fun) name\b|\b(true|up) to its name\b|\bas (its|the) name\b|\bnamesake\b|\bnamed (for|after)\b/iu;
export const FROM_NAME = 'the note reads meaning into the name';

export function readsTheName(text: string): string | null {
  return READS_NAME.exec(text)?.[0] ?? null;
}
