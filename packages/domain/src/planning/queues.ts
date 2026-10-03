/**
 * Planning job queues (docs/api-contracts-async.md §2.2): stored legs for a new plan version, the
 * plan check, seeding Ideas from what members already saved, monthly climate normals per
 * destination, and Tokek placing ideas on days. The worker's planning jobs carry these specs
 * themselves (like the plan queues), so the shared queue catalogue stays as it is.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const PLANNING_QUEUES = {
  legs: 'plan.legs',
  check: 'plan.check',
  ideasSeed: 'ideas.seed',
  climateNormals: 'climate.normals',
  placeIdeas: 'ai.place_ideas',
} as const;

/** Seconds a plan change waits before the check runs, so a burst of edits folds into one run. */
export const PLAN_CHECK_DEBOUNCE_SECONDS = 45;
/** Seconds a plan change waits before its legs are worked out. */
export const PLAN_LEGS_DEBOUNCE_SECONDS = 30;

/**
 * `plan.legs` and `plan.check` are `stately`: per trip key at most one run waiting and one running,
 * so a burst of edits folds into the waiting run (`singleton` would only cap the running one).
 */
export const PLANNING_QUEUE_SPECS = {
  'plan.legs': { policy: 'stately', retryLimit: 3, deadLetter: true, expireInSeconds: 5 * 60 },
  'plan.check': { policy: 'stately', retryLimit: 2, deadLetter: true, expireInSeconds: 2 * 60 },
  'ideas.seed': { policy: 'exclusive', retryLimit: 3, expireInSeconds: 5 * 60 },
  'climate.normals': {
    policy: 'exclusive',
    retryLimit: 2,
    expireInSeconds: 30 * 60,
    cron: { expr: '0 3 1 * *', tz: 'UTC' },
  },
  'ai.place_ideas': { policy: 'exclusive', retryLimit: 1, expireInSeconds: 5 * 60 },
} as const satisfies Record<string, Partial<QueueSpec>>;

/** The planning queues' full specs over the catalogue's defaults (passed in: no import cycle). */
export function planningQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof PLANNING_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(PLANNING_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof PLANNING_QUEUE_SPECS, QueueSpec>;
}

export const PLANNING_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof PLANNING_QUEUE_SPECS, string>
> = {
  'plan.legs': 'Works out and stores the travel between the stops of a new plan version',
  'plan.check': "Checks the crew's plan for clashes, closures, long drives, rain and crowds",
  'ideas.seed': "Fills a trip's Ideas from places its members saved and unplaced swipe matches",
  'climate.normals': "Refreshes each destination's usual chance of rain by month and hour",
  'ai.place_ideas': 'Has Tokek place chosen ideas on days and drafts the change for review',
};

export const planLegsJobSchema = z.object({ trip_id: z.uuid(), version_id: z.uuid() });
export type PlanLegsJob = z.infer<typeof planLegsJobSchema>;

export const PLAN_CHECK_TRIGGERS = [
  'plan',
  'legs',
  'ideas',
  'stances',
  'forecast',
  'daily',
] as const;
export const planCheckJobSchema = z.object({
  trip_id: z.uuid(),
  trigger: z.enum(PLAN_CHECK_TRIGGERS),
});
export type PlanCheckJob = z.infer<typeof planCheckJobSchema>;

export const ideasSeedJobSchema = z.object({
  trip_id: z.uuid(),
  /** Only this member's saves (they just joined); absent: every participant's. */
  user_id: z.uuid().optional(),
});
export type IdeasSeedJob = z.infer<typeof ideasSeedJobSchema>;

export const climateNormalsJobSchema = z.object({
  /** Absent (the monthly cron): every live destination. */
  destination_id: z.uuid().optional(),
});
export type ClimateNormalsJob = z.infer<typeof climateNormalsJobSchema>;

export const placeIdeasJobSchema = z.object({ job_id: z.uuid() });
export type PlaceIdeasJob = z.infer<typeof placeIdeasJobSchema>;
