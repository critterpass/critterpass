/**
 * Stored travel between a day's stops (docs/data-model.md §3.3 `plan_legs`): one row per
 * consecutive pair of a plan version, the stay first and last. Only results we may keep are stored:
 * self-hosted routing or a straight-line estimate, never a Navigation API result
 * (docs/product-decisions.md, routing). `approx` marks a straight-line estimate, which copy words as
 * "about".
 */
import { z } from 'zod';

import { PLAN_LEGS_DEBOUNCE_SECONDS, PLANNING_QUEUES } from './queues';

export const LEG_MODES = ['walk', 'drive', 'ride', 'driver'] as const;
export const legModeSchema = z.enum(LEG_MODES);
export type LegMode = z.infer<typeof legModeSchema>;

export const LEG_SOURCES = ['valhalla', 'straight_line'] as const;
export const legSourceSchema = z.enum(LEG_SOURCES);
export type LegSource = z.infer<typeof legSourceSchema>;

/** The leg end that is the night's stay rather than a stop. */
export const STAY_LEG_KEY = 'stay';

/** A leg end: the stay, or a plan item's `stable_id`. */
export const legKeySchema = z.union([z.literal(STAY_LEG_KEY), z.uuid()]);
export type LegKey = z.infer<typeof legKeySchema>;

/** A `plan_legs` row as it syncs to the phone. */
export const planLegSchema = z.object({
  id: z.uuid(),
  trip_id: z.uuid(),
  version_id: z.uuid(),
  day_id: z.uuid(),
  from_key: legKeySchema,
  to_key: legKeySchema,
  mode: legModeSchema,
  minutes: z.number().int().min(0),
  meters: z.number().int().min(0),
  source: legSourceSchema,
  approx: z.boolean(),
  computed_at: z.iso.datetime({ offset: true }),
});
export type PlanLeg = z.infer<typeof planLegSchema>;

/**
 * Events after which a trip's legs may be missing or stale. A plan is born from the guide's draft
 * (`draft.ready`), replaced by a kept redraft or a restored earlier draft, sent to the crew and
 * locked in: each of those is a version the day plan reads, so each asks for its legs. After that
 * an edited plan version moves stops, and a stay booking added, edited, removed or shared moves
 * the night's anchor. Bursts of events fold into one run per trip after
 * `PLAN_LEGS_DEBOUNCE_SECONDS`, and the run routes every live version of the trip.
 */
export const LEGS_TRIGGER_EVENTS: ReadonlySet<string> = new Set([
  'draft.ready',
  'draft.version_restored',
  'redraft.kept',
  'proposal.sent',
  'proposal.locked',
  'plan.version_created',
  'plan.ops_applied',
  'change_set.applied',
  'change_set.reverted',
  'booking.added',
  'booking.edited',
  'booking.deleted',
  'booking.visibility_changed',
]);

/** The `plan.legs` send an appended event asks for, or `null` when it can't move a leg. */
export function legsJobFor(event: { readonly type: string; readonly tripId: string | null }): {
  readonly queue: typeof PLANNING_QUEUES.legs;
  readonly options: { readonly singletonKey: string; readonly startAfter: number };
} | null {
  if (event.tripId === null || !LEGS_TRIGGER_EVENTS.has(event.type)) return null;
  return {
    queue: PLANNING_QUEUES.legs,
    options: { singletonKey: `legs:${event.tripId}`, startAfter: PLAN_LEGS_DEBOUNCE_SECONDS },
  };
}
