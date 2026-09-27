/**
 * Editorial season data: the shapes of month curves and dated events (the seed files under
 * packages/db/seed/season/ and the audited `upsert_season_editorial` admin command share them), the
 * content-role policy, and the fare-derived price index the weekly `season.ingest` recomputes.
 * Season is a hint for planning, never a rule.
 */
import { z } from 'zod';

import { ALLOW, deny, type PolicyActor, type PolicyResult } from '../policy/types';
import {
  seasonColourRoleSchema,
  seasonEventConfidenceSchema,
  seasonEventKindSchema,
} from './types';

const isoDate = z.iso.date();
const sourced = {
  source: z.string().trim().min(1),
  source_url: z.url().nullable(),
  sourced_on: isoDate,
};

export const seasonMonthInputSchema = z
  .object({
    month: z.number().int().min(1).max(12),
    crowd_index: z.number().int().min(0).max(100),
    price_index: z.number().int().min(0).max(100).nullable(),
    highlight_tag: z.string().trim().min(1).max(24).nullable(),
    colour_role: seasonColourRoleSchema,
    ...sourced,
  })
  .strict();
export type SeasonMonthInput = z.infer<typeof seasonMonthInputSchema>;

export const seasonEventInputSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be kebab-case'),
    kind: seasonEventKindSchema,
    name: z.string().trim().min(1),
    starts_on: isoDate,
    ends_on: isoDate,
    confidence: seasonEventConfidenceSchema,
    ...sourced,
  })
  .strict()
  .refine((event) => event.ends_on >= event.starts_on, {
    message: 'ends_on must not be before starts_on',
    path: ['ends_on'],
  });
export type SeasonEventInput = z.infer<typeof seasonEventInputSchema>;

function allUnique(values: readonly (string | number)[]): boolean {
  return new Set(values).size === values.length;
}

/** One destination's editorial season data: months (each at most once) and events (unique keys). */
export const seasonEditorialSchema = z
  .object({
    months: z
      .array(seasonMonthInputSchema)
      .max(12)
      .refine((months) => allUnique(months.map((m) => m.month)), 'each month at most once'),
    events: z
      .array(seasonEventInputSchema)
      .refine((events) => allUnique(events.map((e) => e.key)), 'event keys must be unique'),
  })
  .strict();
export type SeasonEditorial = z.infer<typeof seasonEditorialSchema>;

/** A seed file: `packages/db/seed/season/<slug>.json`. */
export const seasonSeedFileSchema = seasonEditorialSchema.safeExtend({ destination: z.string() });
export type SeasonSeedFile = z.infer<typeof seasonSeedFileSchema>;

/** `upsert_season_editorial` (admin, content role): replaces the named months and events. */
export const upsertSeasonEditorialInputSchema = seasonEditorialSchema.safeExtend({
  destination_id: z.uuid(),
  /** Marks every written row reviewed now, so it is served; omitted = saved as a draft. */
  approve: z.boolean().optional(),
});
export type UpsertSeasonEditorialInput = z.infer<typeof upsertSeasonEditorialInputSchema>;

export function canUpsertSeasonEditorial(actor: PolicyActor): PolicyResult {
  return actor.roles.includes('content') ? ALLOW : deny('FORBIDDEN');
}

/** Months need fresh fares from at least this many origins before fares replace the editorial index. */
export const SEASON_PRICE_MIN_ORIGINS = 3;

export interface MonthFareSample {
  readonly month: number;
  /** Cheapest fresh fare per origin for that month (minor units, one currency). */
  readonly pricesByOrigin: ReadonlyMap<string, number>;
}

/**
 * Relative price level per month from fares (100 = the dearest covered month, 0 = the cheapest),
 * using the median of each month's per-origin cheapest fares so one odd origin cannot swing it.
 * Months with fewer than three origins are left out, and fewer than two covered months yield
 * nothing, since one month alone has no relative level.
 */
export function priceIndexFromFares(samples: readonly MonthFareSample[]): Map<number, number> {
  const medians = new Map<number, number>();
  for (const sample of samples) {
    const prices = [...sample.pricesByOrigin.values()].sort((a, b) => a - b);
    if (prices.length < SEASON_PRICE_MIN_ORIGINS) continue;
    const mid = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 === 1
        ? (prices[mid] ?? 0)
        : ((prices[mid - 1] ?? 0) + (prices[mid] ?? 0)) / 2;
    medians.set(sample.month, median);
  }
  if (medians.size < 2) return new Map();
  const values = [...medians.values()];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const index = new Map<number, number>();
  for (const [month, median] of medians) {
    index.set(month, high === low ? 50 : Math.round(((median - low) / (high - low)) * 100));
  }
  return index;
}
