/**
 * The drafted itinerary as the drafting pipeline, the planner and the app share it
 * (docs/data-model.md §3.3). Every time, duration and price in here is computed by code (the
 * planner's scheduler and the cost engine); the guide only chooses places, orders them and writes
 * the prose (`theme`, `note`, `summary`). A draft version stores its items as `plan_items` rows and
 * the rest on the version: `itinerary_versions.coverage` (must-dos, flags, closures, stays, the
 * places it names) and `itinerary_versions.metrics` (cost, pace and transit totals).
 */
import { z } from 'zod';

import { PLAN_ITEM_COST_MODELS } from '../enums/plan';

const uuid = z.uuid();
const instant = z.iso.datetime({ offset: true });
const minor = z.number().int().nonnegative();
const currency = z.string().regex(/^[A-Z]{3}$/u);

/** What a drafted item is; stored in `plan_items.category`. */
export const DRAFT_ITEM_KINDS = ['activity', 'meal', 'stay'] as const;
export const draftItemKindSchema = z.enum(DRAFT_ITEM_KINDS);
export type DraftItemKind = z.infer<typeof draftItemKindSchema>;

/** Why an item may not move on a redraft (`plan_items.locked_reason`). */
export const LOCKED_REASONS = ['booking', 'must_do', 'user'] as const;
export const lockedReasonSchema = z.enum(LOCKED_REASONS);
export type LockedReason = z.infer<typeof lockedReasonSchema>;

/**
 * Item flags the review screen shows. `over_budget` and `closed_on_date` are warnings the planner
 * raised; `slot_available` is set only
 * from a supplier's availability answer; `estimate` marks a price from our cost bands.
 */
export const DRAFT_ITEM_FLAGS = [
  'over_budget',
  'closed_on_date',
  'slot_available',
  'estimate',
] as const;
export const draftItemFlagSchema = z.enum(DRAFT_ITEM_FLAGS);
export type DraftItemFlag = z.infer<typeof draftItemFlagSchema>;

export const draftItemSchema = z.object({
  stable_id: uuid,
  kind: draftItemKindSchema,
  poi_id: uuid.nullable(),
  starts_at: instant,
  ends_at: instant,
  tz: z.string().min(1),
  must_do_id: uuid.nullable(),
  booking_id: uuid.nullable(),
  locked_reason: lockedReasonSchema.nullable(),
  cost_model: z.enum(PLAN_ITEM_COST_MODELS),
  amount_minor: minor,
  currency,
  /** Minutes of travel from the previous item of the day (the planner's matrix). */
  travel_min: z.number().int().nonnegative(),
  /** The guide's line about this stop: words only, never a number, time or price. */
  note: z.string().max(240).nullable(),
});
export type DraftItem = z.infer<typeof draftItemSchema>;

export const draftDaySchema = z.object({
  day_no: z.number().int().positive(),
  date: z.iso.date(),
  /** The skeleton's theme for the day ("Old Kyoto, early"). */
  theme: z.string().min(1).max(80),
  items: z.array(draftItemSchema),
});
export type DraftDay = z.infer<typeof draftDaySchema>;

export const itinerarySchema = z.object({
  currency,
  days: z.array(draftDaySchema).min(1),
});
export type Itinerary = z.infer<typeof itinerarySchema>;

/** Why a must-do did not make the draft. */
export const MUST_DO_MISS_REASONS = ['closed', 'no_time', 'unknown_place', 'dropped'] as const;
export const mustDoMissReasonSchema = z.enum(MUST_DO_MISS_REASONS);
export type MustDoMissReason = z.infer<typeof mustDoMissReasonSchema>;

/** A closure found by the pre-draft web check: always with the page it came from. */
export const closureRecordSchema = z.object({
  poi_id: uuid.nullable(),
  /** The place or area the page names ("Nishiki Market", "Old Quarter"). */
  area: z.string().min(1).max(120),
  closed_from: z.iso.date(),
  closed_to: z.iso.date(),
  reason: z.string().min(1).max(160),
  source_url: z.url(),
});
export type ClosureRecord = z.infer<typeof closureRecordSchema>;

/** A stay night block: the estimate comes from our cost bands, never from a supplier. */
export const stayRowSchema = z.object({
  stable_id: uuid,
  stay_type: z.string().min(1),
  nights: z.number().int().positive(),
  check_in: z.iso.date(),
  check_out: z.iso.date(),
  nightly_pp_minor: minor,
  currency,
  /** Only from a booking the crew imported (never from search or an estimate). */
  free_cancel_until: instant.nullable(),
  booking_id: uuid.nullable(),
  /** Affiliate partners a "Book here" click may go to; empty when no link can be offered. */
  partners: z.array(z.enum(['agoda', 'trip_com', 'booking_cj'])),
});
export type StayRow = z.infer<typeof stayRowSchema>;

/** Display fields for every place a version names, so the app never depends on a local place row. */
export const draftPlaceSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  editorial: z.boolean(),
});
export type DraftPlace = z.infer<typeof draftPlaceSchema>;

/** The inputs a draft was built from; a later setup change against these makes it stale. */
export const setupFingerprintSchema = z.object({
  start_date: z.iso.date(),
  end_date: z.iso.date(),
  must_do_ids: z.array(uuid),
  budget_version: z.number().int().nullable(),
  rooms_version: z.number().int().nullable(),
});
export type SetupFingerprint = z.infer<typeof setupFingerprintSchema>;

export const draftCoverageSchema = z.object({
  must_dos: z.object({
    total: z.number().int().nonnegative(),
    made: z.number().int().nonnegative(),
    missing: z.array(
      z.object({ must_do_id: uuid, owner_id: uuid, reason: mustDoMissReasonSchema }),
    ),
  }),
  flags: z.array(z.object({ stable_id: uuid, flag: draftItemFlagSchema })),
  closures: z.array(closureRecordSchema),
  stays: z.array(stayRowSchema),
  places: z.record(z.string(), draftPlaceSchema),
  setup: setupFingerprintSchema,
});
export type DraftCoverage = z.infer<typeof draftCoverageSchema>;

export const dayMetricsSchema = z.object({
  day_no: z.number().int().positive(),
  transit_min: z.number().int().nonnegative(),
  active_min: z.number().int().nonnegative(),
  stops: z.number().int().nonnegative(),
  cost_pp_minor: minor,
});
export type DayMetrics = z.infer<typeof dayMetricsSchema>;

export const draftMetricsSchema = z.object({
  currency,
  cost_pp_minor: minor,
  /** The locked budget target left for the trip itself (flights excluded); null = no target. */
  target_pp_minor: minor.nullable(),
  over_by_pp_minor: minor,
  transit_min: z.number().int().nonnegative(),
  days: z.array(dayMetricsSchema),
  /** How the draft came out of the validator: clean first pass, repair loops, items dropped. */
  validation: z.object({
    first_pass_clean: z.boolean(),
    repair_loops: z.number().int().nonnegative(),
    dropped: z.number().int().nonnegative(),
  }),
});
export type DraftMetrics = z.infer<typeof draftMetricsSchema>;

export const REDRAFT_CHANGE_OPS = ['add', 'remove', 'retime', 'swap'] as const;
export type RedraftChangeOp = (typeof REDRAFT_CHANGE_OPS)[number];

export const redraftItemSnapshotSchema = z.object({
  poi_id: uuid.nullable(),
  kind: draftItemKindSchema,
  starts_at: instant,
  ends_at: instant,
  amount_minor: minor,
});
export type RedraftItemSnapshot = z.infer<typeof redraftItemSnapshotSchema>;

export const redraftChangeSchema = z.object({
  op: z.enum(REDRAFT_CHANGE_OPS),
  stable_id: uuid,
  before: redraftItemSnapshotSchema.nullable(),
  after: redraftItemSnapshotSchema.nullable(),
  /** The guide's reason for this change (words only). */
  reason: z.string().max(240).nullable(),
});
export type RedraftChange = z.infer<typeof redraftChangeSchema>;

export const PACE_DIRECTIONS = ['slower', 'same', 'faster'] as const;

export const redraftMetricsSchema = z.object({
  transit_delta_min: z.number().int(),
  active_delta_min: z.number().int(),
  pace: z.enum(PACE_DIRECTIONS),
  must_dos_kept: z.number().int().nonnegative(),
  must_dos_total: z.number().int().nonnegative(),
  cost_delta_pp_minor: z.number().int(),
  currency,
});
export type RedraftMetrics = z.infer<typeof redraftMetricsSchema>;

/** `agent_jobs.result_ref` of a finished redraft (also the `redraft.result` hint's detail). */
export const redraftResultSchema = z.object({
  redraft_id: uuid,
  day_no: z.number().int().positive(),
  base_version_id: uuid,
  /** Holds the whole trip with the new day; null when nothing changed. */
  candidate_version_id: uuid.nullable(),
  outcome: z.enum(['changed', 'identical']),
  title: z.string().max(80).nullable(),
  summary: z.string().max(240).nullable(),
  changes: z.array(redraftChangeSchema),
  metrics: redraftMetricsSchema.nullable(),
});
export type RedraftResult = z.infer<typeof redraftResultSchema>;

/** `agent_jobs.result_ref` of a finished draft. */
export const draftResultSchema = z.object({
  version_id: uuid,
  days: z.number().int().positive(),
  summary: z.string().max(240).nullable(),
});
export type DraftResult = z.infer<typeof draftResultSchema>;
