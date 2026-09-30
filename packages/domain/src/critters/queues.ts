/**
 * Critter job queues (docs/api-contracts-async.md §2.3): evidence verification, egg grants and
 * landed hatches, the crew counts table, co-presence grouping, the rewards fan-out, conditional
 * reminders and their reschedule after a content release moves a window.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const CRITTER_QUEUES = {
  verify: 'critter.verify',
  grantEggs: 'critter.grant_eggs',
  hatch: 'critter.hatch',
  crewCounts: 'critter.crew_counts',
  copresence: 'copresence.evaluate',
  rewardFanout: 'reward.fanout',
  remindersConditional: 'reminders.conditional',
  remindersReschedule: 'reminders.reschedule',
} as const;

export const CRITTER_QUEUE_SPECS = {
  'critter.verify': { policy: 'exclusive', retryLimit: 5, notify: true },
  'critter.grant_eggs': { policy: 'exclusive', retryLimit: 5, notify: true },
  'critter.hatch': { policy: 'exclusive', retryLimit: 5, notify: true },
  'critter.crew_counts': { policy: 'exclusive', retryLimit: 5 },
  'copresence.evaluate': { policy: 'exclusive', retryLimit: 5, notify: true },
  'reward.fanout': { policy: 'standard', retryLimit: 5, deadLetter: true },
  'reminders.conditional': { policy: 'exclusive', retryLimit: 3 },
  'reminders.reschedule': { policy: 'singleton', retryLimit: 3, expireInSeconds: 10 * 60 },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function critterQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof CRITTER_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(CRITTER_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof CRITTER_QUEUE_SPECS, QueueSpec>;
}

export const CRITTER_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof CRITTER_QUEUE_SPECS, string>
> = {
  'critter.verify': 'Scores befriend evidence: verified enters the dex, revoked slips away',
  'critter.grant_eggs': "Grants an egg to each boarded traveller on a trip that doesn't have one",
  'critter.hatch': "Hatches a traveller's egg when their final leg lands",
  'critter.crew_counts': "Rewrites one user's crew collection counts (removed when hidden)",
  'copresence.evaluate': 'Grants a co-presence legendary once every needed member overlapped',
  'reward.fanout': 'Runs every registered reward handler for one grant, at one server time',
  'reminders.conditional': 'Fires a reminder only while its condition still holds',
  'reminders.reschedule': 'Moves pending legendary reminders after their windows changed',
};

export const verifyJobSchema = z.object({ encounter_id: z.uuid() });
export type VerifyJob = z.infer<typeof verifyJobSchema>;

/** `user_id` absent: every boarded traveller on the trip. */
export const grantEggsJobSchema = z.object({
  trip_id: z.uuid(),
  user_id: z.uuid().optional(),
});
export type GrantEggsJob = z.infer<typeof grantEggsJobSchema>;

export const hatchJobSchema = z.object({
  trip_id: z.uuid(),
  user_id: z.uuid(),
  trigger: z.literal('landed'),
});
export type HatchJob = z.infer<typeof hatchJobSchema>;

export const crewCountsJobSchema = z.object({ user_id: z.uuid() });
export type CrewCountsJob = z.infer<typeof crewCountsJobSchema>;

export const copresenceJobSchema = z.object({ trip_id: z.uuid(), spawn_rule_id: z.uuid() });
export type CopresenceJob = z.infer<typeof copresenceJobSchema>;

export const REWARD_KINDS = ['critter_found'] as const;
export const rewardFanoutJobSchema = z.object({
  kind: z.enum(REWARD_KINDS),
  /** The collection entries granted together; they share one `found_at`. */
  entry_ids: z.array(z.uuid()).min(1),
  granted_at: z.iso.datetime({ offset: true }),
});
export type RewardFanoutJob = z.infer<typeof rewardFanoutJobSchema>;

/** Timer kinds armed in `scheduled_events` (the queue each fires into). */
export const REMINDER_TIMER_KIND = CRITTER_QUEUES.remindersConditional;
