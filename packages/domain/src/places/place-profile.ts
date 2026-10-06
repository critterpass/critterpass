/**
 * AI place profiles (`place_profiles`, docs/data-model.md §3.13): the short page a place gets when
 * no reviewed note exists, written from web pages by the `places.profile` job. Text is kept per
 * language (`texts`, keyed by app locale: written in English, plus Vietnamese for places in
 * Vietnam, and translated into a reader's language the first time one asks); labels, visit length,
 * facts' sources and photos are language-free. Every fact carries the page it was quoted from.
 */
import { z } from 'zod';

import type { PoiCategory } from './categories';

export const PLACE_BEST_TIMES = [
  'early_morning',
  'morning',
  'midday',
  'afternoon',
  'sunset',
  'evening',
  'after_dark',
] as const;
export type PlaceBestTime = (typeof PLACE_BEST_TIMES)[number];

/** What food is to a visit: a full meal, coffee or a snack, or nothing. */
export const PLACE_MEAL_ROLES = ['meal', 'light', 'none'] as const;
export type PlaceMealRole = (typeof PLACE_MEAL_ROLES)[number];

/** entry: one adult ticket; hours: opening hours; dress: what to wear; know: queues, cash, closures. */
export const PLACE_FACT_KINDS = ['entry', 'hours', 'dress', 'know'] as const;
export type PlaceFactKind = (typeof PLACE_FACT_KINDS)[number];

export const PLACE_PROFILE_STATUSES = ['pending', 'ready', 'declined', 'failed'] as const;
export type PlaceProfileStatus = (typeof PLACE_PROFILE_STATUSES)[number];

/** Kinds that never get a profile: a stop or a clinic is a pin, not a page. */
export const PROFILE_SKIPPED_CATEGORIES: ReadonlySet<PoiCategory> = new Set(['transit', 'health']);

/**
 * Kinds that usually have an entry fee or opening hours, so a second web source is asked for them.
 * Elsewhere (a beach, a stay) the second search is skipped, and any fee or hours line the write
 * proposes is kept only when the place's own site states it.
 */
export const SECOND_SOURCE_CATEGORIES: ReadonlySet<PoiCategory> = new Set([
  'temple_shrine',
  'food',
  'market',
  'nature',
  'museum',
  'nightlife',
  'shopping',
]);

/** `destinations.country` holds an ISO code or an English name. */
const VIETNAM = new Set(['vn', 'vietnam', 'viet nam']);

export function isVietnam(country: string | null): boolean {
  return country !== null && VIETNAM.has(country.trim().toLowerCase());
}

/** The languages a profile is written in at generation time, by the place's country. */
export function profileSourceLocales(country: string | null): readonly ('en' | 'vi')[] {
  return isVietnam(country) ? ['en', 'vi'] : ['en'];
}

/** One language's lines; `facts[i]` words `place_profiles.facts[i]`. */
export const placeProfileTextSchema = z.object({
  why_go: z.string(),
  best_time: z.string(),
  crowd: z.string(),
  facts: z.array(z.string()),
});
export type PlaceProfileText = z.infer<typeof placeProfileTextSchema>;

/** `GET /v1/places/{id}` → `profile` (docs/api-contracts.md §5.5), in the reader's language. */
export const placeProfileWireSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({
    status: z.literal('ready'),
    /** The language the lines are in: the reader's, else English while a translation is made. */
    locale: z.string(),
    whyGo: z.string(),
    bestTime: z.string(),
    crowd: z.string(),
    bestTimes: z.array(z.enum(PLACE_BEST_TIMES)),
    mealRole: z.enum(PLACE_MEAL_ROLES).nullable(),
    visitMin: z.number().int().nullable(),
    dish: z.string().nullable(),
    facts: z.array(
      z.object({
        kind: z.enum(PLACE_FACT_KINDS),
        text: z.string(),
        sourceUrl: z.string(),
        /** Confirmed by a second search, quoted from the place's own site, or one page only. */
        secondSource: z.enum(['agrees', 'own_site', 'single']),
      }),
    ),
    photos: z.array(z.object({ url: z.string(), sourcePage: z.string() })),
    sources: z.array(z.object({ url: z.string(), title: z.string() })),
    generatedAt: z.string(),
  }),
]);
export type PlaceProfileWire = z.infer<typeof placeProfileWireSchema>;
