/**
 * Opening-hours research (docs/api-contracts-async.md §2.3; docs/product-decisions.md D23): a weekly
 * job proposes hours for curated places that have none, from cited web pages, and an operator
 * verifies each proposal in the console before it reaches `pois.hours`. Places that have no opening
 * hours of their own (beaches, open nature, parks, stations) are never researched.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';
import type { PoiCategory } from './categories';

export const HOURS_RESEARCH_QUEUE = 'places.hours_research';

/** Categories without opening hours of their own: no search, no model call. */
export const HOURS_RESEARCH_SKIPPED_CATEGORIES: ReadonlySet<PoiCategory> = new Set([
  'beach',
  'nature',
  'transit',
]);

export function needsHoursResearch(category: string): boolean {
  return !HOURS_RESEARCH_SKIPPED_CATEGORIES.has(category as PoiCategory);
}

export const HOURS_RESEARCH_QUEUE_SPECS = {
  [HOURS_RESEARCH_QUEUE]: {
    policy: 'stately',
    retryLimit: 1,
    retryDelay: 600,
    expireInSeconds: 2 * 60 * 60,
    // Mondays 03:00 UTC (10:00 in Asia).
    cron: { expr: '0 3 * * 1', tz: 'UTC' },
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function hoursResearchQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof HOURS_RESEARCH_QUEUE_SPECS, QueueSpec>> {
  return {
    [HOURS_RESEARCH_QUEUE]: { ...defaults, ...HOURS_RESEARCH_QUEUE_SPECS[HOURS_RESEARCH_QUEUE] },
  };
}

export const HOURS_RESEARCH_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof HOURS_RESEARCH_QUEUE_SPECS, string>
> = {
  [HOURS_RESEARCH_QUEUE]: 'Researches opening hours for curated places, for console verification',
};

export const hoursResearchJobSchema = z.object({
  /** One destination slug; unset = every destination. */
  destination: z.string().min(1).optional(),
  /** Places researched this run; unset = the configured cap. */
  limit: z.number().int().positive().max(5_000).optional(),
});
export type HoursResearchJob = z.infer<typeof hoursResearchJobSchema>;
