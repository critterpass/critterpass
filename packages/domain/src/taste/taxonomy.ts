/**
 * The taste tag taxonomy: the vocabulary quiz answers, chips, inviters and the guide write into a
 * taste profile. The slugs match the `taste_quiz` content release's tag enum (its schema test
 * checks both lists stay equal). Display labels are translated in the app; this module only owns
 * the slugs, their machine-readable token for the pass MRZ, and which profile axis a tag sets.
 */
import { z } from 'zod';

export const TASTE_TAGS = [
  'street_food',
  'sit_down_dining',
  'coffee',
  'nightlife',
  'quiet_evenings',
  'early_starts',
  'late_starts',
  'easy_pace',
  'packed_days',
  'nature',
  'hiking',
  'beach',
  'culture',
  'history',
  'temples',
  'museums',
  'markets',
  'shopping',
  'wellness',
  'adventure',
  'photo_spots',
  'local_life',
  'splurge',
  'thrifty',
] as const;
export const tasteTagSchema = z.enum(TASTE_TAGS);
export type TasteTag = z.infer<typeof tasteTagSchema>;

export function isTasteTag(value: string): value is TasteTag {
  return (TASTE_TAGS as readonly string[]).includes(value);
}

/** One MRZ word per tag (A–Z only), e.g. `SUNRISE<FOOD<EASY` on the pass's second line. */
export const TASTE_TAG_MRZ: Readonly<Record<TasteTag, string>> = {
  street_food: 'FOOD',
  sit_down_dining: 'DINING',
  coffee: 'COFFEE',
  nightlife: 'NIGHT',
  quiet_evenings: 'QUIET',
  early_starts: 'SUNRISE',
  late_starts: 'LATE',
  easy_pace: 'EASY',
  packed_days: 'PACKED',
  nature: 'NATURE',
  hiking: 'HIKES',
  beach: 'BEACH',
  culture: 'CULTURE',
  history: 'HISTORY',
  temples: 'TEMPLES',
  museums: 'MUSEUMS',
  markets: 'MARKETS',
  shopping: 'SHOPS',
  wellness: 'WELL',
  adventure: 'CHAOS',
  photo_spots: 'PHOTOS',
  local_life: 'LOCAL',
  splurge: 'SPLURGE',
  thrifty: 'THRIFTY',
};

export const TAG_SOURCES = ['quiz', 'chips', 'inviter', 'guide'] as const;
export const tagSourceSchema = z.enum(TAG_SOURCES);
export type TagSource = z.infer<typeof tagSourceSchema>;

export type Chronotype = 'early' | 'late';
export type Pace = 'easy' | 'packed';

/** The profile axes a tag decides: the first matching tag in rank order wins each axis. */
const CHRONOTYPE_BY_TAG: Partial<Record<TasteTag, Chronotype>> = {
  early_starts: 'early',
  late_starts: 'late',
  nightlife: 'late',
};
const PACE_BY_TAG: Partial<Record<TasteTag, Pace>> = {
  easy_pace: 'easy',
  packed_days: 'packed',
};

export function chronotypeOf(tags: readonly TasteTag[]): Chronotype | null {
  for (const tag of tags) {
    const value = CHRONOTYPE_BY_TAG[tag];
    if (value !== undefined) return value;
  }
  return null;
}

export function paceOf(tags: readonly TasteTag[]): Pace | null {
  for (const tag of tags) {
    const value = PACE_BY_TAG[tag];
    if (value !== undefined) return value;
  }
  return null;
}

/** How many tags the pass shows as its travel style ("SUNRISE · STREET FOOD · EASY"). */
export const PASS_STYLE_TAG_COUNT = 3;
