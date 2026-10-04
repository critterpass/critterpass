/**
 * Folding place text for matching on the phone: accents, đ and case go, punctuation becomes a
 * space, so a traveller's keyboard spelling finds the local one ("cafe" finds "Café", "da nang"
 * finds "Đà Nẵng", "My Son" finds "Mỹ Sơn"). The category words let an offline search fall back to
 * what kind of place was asked for ("coffee near the terraces" → the cafes saved here).
 */
/* eslint-disable lingui/no-unlocalized-strings -- folded match vocabulary, never copy. */
import type { PoiCategory } from '@cp/domain';

export function foldPlaceText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function foldWords(text: string): string[] {
  const folded = foldPlaceText(text);
  return folded === '' ? [] : folded.split(' ');
}

/** What a typed word asks for: a category, and for food the tag that narrows it ("coffee"). */
export interface CategoryWord {
  readonly category: PoiCategory;
  readonly tag?: string;
}

/** Folded words (English and Vietnamese) that name a kind of place. */
export const CATEGORY_WORDS: Readonly<Record<string, CategoryWord>> = {
  coffee: { category: 'food', tag: 'coffee' },
  cafe: { category: 'food', tag: 'coffee' },
  cafes: { category: 'food', tag: 'coffee' },
  ca: { category: 'food', tag: 'coffee' },
  phe: { category: 'food', tag: 'coffee' },
  food: { category: 'food' },
  eat: { category: 'food' },
  restaurant: { category: 'food' },
  restaurants: { category: 'food' },
  dinner: { category: 'food' },
  lunch: { category: 'food' },
  breakfast: { category: 'food' },
  warung: { category: 'food' },
  temple: { category: 'temple_shrine' },
  temples: { category: 'temple_shrine' },
  shrine: { category: 'temple_shrine' },
  pura: { category: 'temple_shrine' },
  chua: { category: 'temple_shrine' },
  den: { category: 'temple_shrine' },
  beach: { category: 'beach' },
  beaches: { category: 'beach' },
  bien: { category: 'beach' },
  waterfall: { category: 'nature' },
  waterfalls: { category: 'nature' },
  thac: { category: 'nature' },
  hike: { category: 'nature' },
  park: { category: 'nature' },
  market: { category: 'market' },
  markets: { category: 'market' },
  museum: { category: 'museum' },
  museums: { category: 'museum' },
  bar: { category: 'nightlife' },
  bars: { category: 'nightlife' },
  club: { category: 'nightlife' },
  pub: { category: 'nightlife' },
  shop: { category: 'shopping' },
  shops: { category: 'shopping' },
  shopping: { category: 'shopping' },
  spa: { category: 'health' },
  massage: { category: 'health' },
};

/** Words that never name a place or a kind of place. */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'near',
  'nearby',
  'in',
  'at',
  'by',
  'for',
  'with',
  'to',
  'of',
  'and',
  'some',
  'somewhere',
  'place',
  'places',
  'gan',
  'o',
  'mot',
  'va',
  'tai',
]);
