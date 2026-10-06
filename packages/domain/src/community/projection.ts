/**
 * The public copy of a crew's plan (docs/data-model.md §3.15 `shared_plans.projection`): built
 * from the plan skeleton and the crew's toggles, once, by the server; the publish sheet's preview
 * runs the same function so what the crew sees is what other crews get. Nothing private crosses:
 * no notes, no chat, no trip or user ids, names only when the crew turns them on, costs per person
 * rounded to 10 major units, photos only those already cleared for faces.
 */
import { z } from 'zod';

import { POI_CATEGORIES, type PoiCategory } from '../places/categories';
import type { TasteTag } from '../taste/taxonomy';
import { scrubPublicText } from './scrub';

export const sharedPlanTogglesSchema = z.strictObject({
  names: z.boolean(),
  costs: z.boolean(),
  photos: z.boolean(),
});
export type SharedPlanToggles = z.infer<typeof sharedPlanTogglesSchema>;

/** Names off, costs and photos on (the publish sheet's defaults). */
export const DEFAULT_SHARED_PLAN_TOGGLES: SharedPlanToggles = {
  names: false,
  costs: true,
  photos: true,
};

export const MAX_SHARED_PHOTOS = 12;

export interface PlanSkeletonPlace {
  readonly poi_id: string;
  readonly name: string;
  readonly category: string | null;
}

export interface PlanSkeletonDay {
  readonly day_no: number;
  readonly theme: string | null;
  readonly places: readonly PlanSkeletonPlace[];
}

export interface PlanSkeleton {
  readonly destination_id: string;
  readonly destination_name: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  /** The participants' first names, in seat order. */
  readonly first_names: readonly string[];
  readonly days: readonly PlanSkeletonDay[];
  readonly cost_pp_minor: number | null;
  readonly currency: string | null;
  /** The currency's minor-unit exponent (2 for USD, 0 for VND). */
  readonly currency_exponent: number;
  /** Photo keys already cleared for faces, best first. */
  readonly photo_keys: readonly string[];
  readonly tips: readonly { readonly poi_id: string; readonly text: string }[];
  /** True once the trip has ended (otherwise "Planned, not travelled yet"). */
  readonly travelled: boolean;
}

const placeSchema = z.object({
  poi_id: z.uuid(),
  name: z.string(),
  category: z.enum(POI_CATEGORIES),
});

export const sharedPlanProjectionSchema = z.object({
  v: z.literal(1),
  destination_id: z.uuid(),
  destination_name: z.string(),
  days_count: z.number().int().min(0),
  travel_month: z.number().int().min(1).max(12).nullable(),
  travel_year: z.number().int().nullable(),
  crew_size: z.number().int().min(1),
  crew_names: z.array(z.string()).nullable(),
  cost_pp_rounded_minor: z.number().int().nullable(),
  currency: z.string().nullable(),
  travelled: z.boolean(),
  tags: z.array(z.string()),
  days: z.array(
    z.object({
      day_no: z.number().int(),
      theme: z.string().nullable(),
      places: z.array(placeSchema),
    }),
  ),
  photos: z.array(z.string()),
  tips: z.array(z.object({ poi_id: z.uuid(), text: z.string() })),
});
export type SharedPlanProjection = z.infer<typeof sharedPlanProjectionSchema>;

function categoryOf(value: string | null): PoiCategory {
  return (POI_CATEGORIES as readonly string[]).includes(value ?? '')
    ? (value as PoiCategory)
    : 'other';
}

/** Rounds a per-person cost to the nearest 10 major units (never below 10 when there is a cost). */
export function roundCostPerPerson(minor: number, exponent: number): number {
  const step = 10 * 10 ** exponent;
  return Math.max(step, Math.round(minor / step) * step);
}

const CATEGORY_TAGS: Partial<Record<PoiCategory, TasteTag>> = {
  temple_shrine: 'temples',
  food: 'street_food',
  market: 'markets',
  nature: 'nature',
  beach: 'beach',
  museum: 'museums',
  nightlife: 'nightlife',
  shopping: 'shopping',
};

/** Places per day at or above which a plan reads as packed, at or below which as easy. */
export const PACKED_PLACES_PER_DAY = 5;
export const EASY_PLACES_PER_DAY = 3;

/**
 * The plan's taste: each taste tag's share of the plan's places (0–1), plus its pace. This is the
 * vector the browse ranks against a crew's tastes; the top tags label the card.
 */
export function planTaste(days: readonly PlanSkeletonDay[]): Record<string, number> {
  const counts = new Map<string, number>();
  let places = 0;
  for (const day of days) {
    for (const place of day.places) {
      places += 1;
      const tag = CATEGORY_TAGS[categoryOf(place.category)];
      if (tag !== undefined) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const taste: Record<string, number> = {};
  if (places === 0) return taste;
  for (const [tag, count] of counts) taste[tag] = Math.round((count / places) * 1000) / 1000;
  const perDay = places / Math.max(1, days.length);
  if (perDay >= PACKED_PLACES_PER_DAY) taste['packed_days'] = 1;
  else if (perDay <= EASY_PLACES_PER_DAY) taste['easy_pace'] = 1;
  return taste;
}

/** The plan's labels: pace first, then its most frequent place tags (at most three). */
export function planTags(taste: Readonly<Record<string, number>>): string[] {
  const pace = ['packed_days', 'easy_pace'].filter((tag) => taste[tag] !== undefined);
  const rest = Object.entries(taste)
    .filter(([tag]) => !pace.includes(tag))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
  return [...pace, ...rest].slice(0, 3);
}

function monthOf(date: string | null): { month: number | null; year: number | null } {
  if (date === null) return { month: null, year: null };
  const [year, month] = date.split('-').map(Number);
  return { month: month ?? null, year: year ?? null };
}

export function buildSharedPlanProjection(
  skeleton: PlanSkeleton,
  toggles: SharedPlanToggles,
): SharedPlanProjection {
  const taste = planTaste(skeleton.days);
  const { month, year } = monthOf(skeleton.start_date);
  const costShown = toggles.costs && skeleton.cost_pp_minor !== null && skeleton.currency !== null;
  return {
    v: 1,
    destination_id: skeleton.destination_id,
    destination_name: skeleton.destination_name,
    days_count: skeleton.days.length,
    travel_month: month,
    travel_year: year,
    crew_size: Math.max(1, skeleton.first_names.length),
    crew_names: toggles.names ? [...skeleton.first_names] : null,
    cost_pp_rounded_minor: costShown
      ? roundCostPerPerson(skeleton.cost_pp_minor ?? 0, skeleton.currency_exponent)
      : null,
    currency: costShown ? skeleton.currency : null,
    travelled: skeleton.travelled,
    tags: planTags(taste),
    days: skeleton.days.map((day) => ({
      day_no: day.day_no,
      theme: day.theme === null ? null : scrubPublicText(day.theme),
      places: day.places.map((place) => ({
        poi_id: place.poi_id,
        name: place.name,
        category: categoryOf(place.category),
      })),
    })),
    photos: toggles.photos ? skeleton.photo_keys.slice(0, MAX_SHARED_PHOTOS) : [],
    tips: skeleton.tips.map((tip) => ({ poi_id: tip.poi_id, text: scrubPublicText(tip.text) })),
  };
}
