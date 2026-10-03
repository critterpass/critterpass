/**
 * Stored travel between a day's stops (docs/data-model.md §3.3 `plan_legs`): one row per
 * consecutive pair of a plan version, the stay first and last. Only results we may keep are stored:
 * self-hosted routing or a straight-line estimate, never a Navigation API result
 * (docs/product-decisions.md D21). `approx` marks a straight-line estimate, which copy words as
 * "about".
 */
import { z } from 'zod';

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
