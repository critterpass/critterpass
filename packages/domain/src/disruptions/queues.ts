/**
 * Disruption job queues (docs/api-contracts-async.md §2.2, §2.3): the flight disruption agent, the
 * forecast watcher and its replan, the storm decision and commit, the running-late sweep, and the
 * application of a crew decision on a disruption row.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const DISRUPTION_QUEUES = {
  flight: 'ai.disruption',
  react: 'disruption.react',
  noAnswer: 'disruption.no_answer',
  weatherWatch: 'weather.watch',
  replan: 'ai.replan',
  stormCommit: 'storm.commit',
  runningLate: 'eta.running_late',
} as const;

export const DISRUPTION_QUEUE_SPECS = {
  'ai.disruption': { policy: 'exclusive', retryLimit: 3, expireInSeconds: 5 * 60, notify: true },
  'disruption.react': { policy: 'standard', retryLimit: 3, notify: true },
  'disruption.no_answer': { policy: 'exclusive', retryLimit: 2 },
  'weather.watch': {
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 10 * 60,
    cron: { expr: '*/15 * * * *', tz: 'UTC' },
  },
  'ai.replan': { policy: 'exclusive', retryLimit: 2, expireInSeconds: 5 * 60 },
  'storm.commit': { policy: 'exclusive', retryLimit: 3, deadLetter: true, notify: true },
  'eta.running_late': {
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 50,
    keepCompletedSeconds: 3600,
    cron: { expr: '* * * * *', tz: 'UTC' },
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function disruptionQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof DISRUPTION_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(DISRUPTION_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof DISRUPTION_QUEUE_SPECS, QueueSpec>;
}

export const DISRUPTION_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof DISRUPTION_QUEUE_SPECS, string>
> = {
  'ai.disruption':
    "Works out a flight change's impact, runs the guide's own fixes, asks for the rest",
  'disruption.react':
    "Moves a disruption row on a real outcome: an applied fix, a crew decision, a vendor's reply",
  'disruption.no_answer': 'Marks a sent message the vendor did not answer in 30 minutes',
  'weather.watch':
    "Scores each trip's forecast watch list and pings only on plan-changing escalations",
  'ai.replan': 'Proposes moving an outdoor item out of a forecast rain window',
  'storm.commit': 'Commits a storm decision: the day swap and a truthful supplier move',
  'eta.running_late': 'Marks running-late journeys stale when checks stop and clears old checks',
};

export const flightDisruptionJobSchema = z.object({
  trip_id: z.uuid(),
  segment_id: z.uuid(),
});
export type FlightDisruptionJob = z.infer<typeof flightDisruptionJobSchema>;

/** Events a disruption row reacts to, handed from whichever process appended them. */
export const DISRUPTION_REACT_EVENTS = [
  'change_set.proposed',
  'change_set.applied',
  'guide_action.undone',
  'poll.closed',
  'vendor_msg.approved',
  'vendor_msg.sent',
  'vendor_msg.failed',
  'vendor_msg.reply_parsed',
  'disruption.action_undone',
  'activity.hold_expired',
  'activity.hold_released',
  'activity.rejected',
] as const;
const REACT_EVENTS: ReadonlySet<string> = new Set(DISRUPTION_REACT_EVENTS);

export function isDisruptionReactEvent(type: string): boolean {
  return REACT_EVENTS.has(type);
}

/** The worker reads the event (payload, actor) itself: the job carries its id only. */
export const disruptionReactJobSchema = z.object({
  event_id: z.uuid(),
  event_type: z.enum(DISRUPTION_REACT_EVENTS),
});
export type DisruptionReactJob = z.infer<typeof disruptionReactJobSchema>;

export const noAnswerJobSchema = z.object({
  disruption_id: z.uuid(),
  action_id: z.string().min(1).max(120),
});
export type NoAnswerJob = z.infer<typeof noAnswerJobSchema>;

/** How long a sent message waits for the vendor before the row offers a call. */
export const VENDOR_NO_ANSWER_MIN = 30;
