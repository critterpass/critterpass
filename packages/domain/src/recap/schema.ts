/**
 * The recap a trip gets when it ends (docs/data-model.md §3.10 `recaps`, `recap_awards`): every
 * number here is computed by code from the trip's plan, rides, ledger, finds and visits; the guide
 * only words it. These schemas validate the jsonb columns the worker writes and the app reads:
 * `recaps.stats`, `recaps.route`, `recaps.receipt`, `recaps.got_away` and `recap_awards.evidence`.
 *
 * Amounts are integer minor units in `currency` (the crew's settlement currency, P12 FX already
 * applied by the expense writer). Distances are metres. Local dates are `YYYY-MM-DD` and local
 * times `HH:MM`, both on the trip's own clock.
 */
import { z } from 'zod';

import { rideProviderSchema } from '../suppliers/rides';

export const RECAP_STATUSES = ['queued', 'building', 'ready', 'failed'] as const;
export const recapStatusSchema = z.enum(RECAP_STATUSES);
export type RecapStatus = z.infer<typeof recapStatusSchema>;

/** The sections a version bump can change (`recaps.changed_sections`). */
export const RECAP_SECTIONS = ['stats', 'route', 'receipt', 'got_away', 'awards'] as const;
export const recapSectionSchema = z.enum(RECAP_SECTIONS);
export type RecapSection = z.infer<typeof recapSectionSchema>;

/** The MVP vote closes this long after the recap is first ready (or once everyone voted). */
export const RECAP_MVP_VOTE_HOURS = 72;

/** The eight story cards, in play order. */
export const RECAP_CARDS = [
  'cover',
  'critters',
  'route',
  'awards',
  'receipt',
  'got_away',
  'stamp',
  'postcard',
] as const;
export const recapCardSchema = z.enum(RECAP_CARDS);
export type RecapCard = z.infer<typeof recapCardSchema>;

/**
 * The guide's words for one story card (`recaps.cards.<card>`), written from the aggregates only:
 * `narration` is what the guide says over the card (text, and the recorded voice when there is
 * one), `headline` an optional big line, `line` the card's one extra sentence (the route's longest
 * leg, the receipt's sign-off, the got-away line the summary also shows, the postcard's note).
 */
export const recapCardCopySchema = z.strictObject({
  narration: z.string().min(1).max(240),
  headline: z.string().min(1).max(60).optional(),
  line: z.string().min(1).max(160).optional(),
});
export type RecapCardCopy = z.infer<typeof recapCardCopySchema>;

/** `recaps.cards`: copy per card, keyed by `RECAP_CARDS`; `{}` until the guide has written it. */
export const recapCardsCopySchema = z.strictObject({
  cover: recapCardCopySchema.optional(),
  critters: recapCardCopySchema.optional(),
  route: recapCardCopySchema.optional(),
  awards: recapCardCopySchema.optional(),
  receipt: recapCardCopySchema.optional(),
  got_away: recapCardCopySchema.optional(),
  stamp: recapCardCopySchema.optional(),
  postcard: recapCardCopySchema.optional(),
});
export type RecapCardsCopy = z.infer<typeof recapCardsCopySchema>;

const localDate = z.iso.date();
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u, 'HH:MM');
const count = z.int().min(0);
const minor = z.int();
const metres = z.int().min(0);
const currency = z.string().regex(/^[A-Z]{3}$/u);

// --- route --------------------------------------------------------------------------------------

/** A place on the trail: consecutive plan items at the same place fold into one stop. */
export const recapStopSchema = z.strictObject({
  poi_id: z.uuid(),
  name: z.string(),
  category: z.string().nullable(),
  /** Trip days (1-based) the stop spans. */
  day_from: z.int().min(1),
  day_to: z.int().min(1),
  /** Local start of the stop's first plan item, when it had a time. */
  local_time: localTime.nullable(),
  /** The stop's first plan item started before local sunrise. */
  before_sunrise: z.boolean(),
});
export type RecapStop = z.infer<typeof recapStopSchema>;

export const recapLegRideSchema = z.strictObject({
  provider: rideProviderSchema,
  /** The crew's own driver or transfer company, when the ride named one. */
  provider_id: z.uuid().nullable(),
  provider_name: z.string().nullable(),
});
export type RecapLegRide = z.infer<typeof recapLegRideSchema>;

/** A leg between two stops (indexes into `stops`), routed by road or a straight-line estimate. */
export const recapLegSchema = z.strictObject({
  from: count,
  to: count,
  distance_m: metres,
  minutes: count,
  /** True when the distance is a straight-line estimate, not a routed path. */
  estimate: z.boolean(),
  /** The ride the crew logged for this leg, if any. */
  ride: recapLegRideSchema.nullable(),
});
export type RecapLeg = z.infer<typeof recapLegSchema>;

/** Who drove most of the ridden kilometres: a named driver, else the ride app or taxi. */
export const recapTopDriverSchema = z.strictObject({
  provider: rideProviderSchema,
  provider_id: z.uuid().nullable(),
  provider_name: z.string().nullable(),
  distance_m: metres,
  rides: count,
});
export type RecapTopDriver = z.infer<typeof recapTopDriverSchema>;

export const recapRouteSchema = z.strictObject({
  stops: z.array(recapStopSchema),
  legs: z.array(recapLegSchema),
  total_m: metres,
  /** Any leg's distance is an estimate. */
  estimated: z.boolean(),
  /** Index into `legs` of the longest leg. */
  longest_leg: count.nullable(),
  ridden_m: metres,
  rides: count,
  top_driver: recapTopDriverSchema.nullable(),
});
export type RecapRoute = z.infer<typeof recapRouteSchema>;

// --- receipt ------------------------------------------------------------------------------------

export const RECAP_RECEIPT_CATEGORIES = ['stays', 'food', 'transit', 'fun', 'other'] as const;

export const recapReceiptLineSchema = z.strictObject({
  category: z.enum(RECAP_RECEIPT_CATEGORIES),
  total_minor: minor,
  count,
});

export const recapReceiptSchema = z.strictObject({
  currency,
  lines: z.array(recapReceiptLineSchema),
  total_minor: minor,
  expenses: count,
  /** Food expenses (the receipt's "61 MEALS"). */
  meals: count,
  travellers: z.int().min(1),
  /** `total_minor / travellers`, rounded half away from zero. */
  each_minor: minor,
  /** The locked sweet spot per person, and times the travellers; null without one in `currency`. */
  planned_each_minor: minor.nullable(),
  planned_total_minor: minor.nullable(),
  /** `planned_total_minor - total_minor`: positive is under budget, negative over. */
  under_minor: minor.nullable(),
  priciest: z
    .strictObject({ expense_id: z.uuid(), description: z.string(), amount_minor: minor })
    .nullable(),
  /** The day with the smallest spend per traveller, among days with any spend. */
  cheapest_day: z
    .strictObject({ day_no: z.int().min(1), local_date: localDate, each_minor: minor })
    .nullable(),
  /** What the crew still owes each other on this trip (sum of every debtor's balance). */
  outstanding_minor: minor,
  settled: z.boolean(),
  /** Local date the last balance cleared; null while anything is owed or nothing ever was. */
  settled_on: localDate.nullable(),
  /** Days from the trip's last day to `settled_on` (negative: settled before the trip ended). */
  settled_days_after_end: z.int().nullable(),
});
export type RecapReceipt = z.infer<typeof recapReceiptSchema>;

// --- critters and the one that got away ---------------------------------------------------------

export const recapCrittersSchema = z.strictObject({
  /** Distinct forms any traveller found on this trip. */
  forms_found: count,
  /** Distinct critters some traveller met for the first time on this trip. */
  new_critters: count,
  form_ids: z.array(z.uuid()),
});
export type RecapCritters = z.infer<typeof recapCrittersSchema>;

export const recapGotAwaySchema = z.strictObject({
  form_id: z.uuid(),
  critter_id: z.uuid(),
  critter_key: z.string(),
  rarity: z.enum(['epic', 'legendary']),
  /** Encounters with this form on the trip that ended without a befriend. */
  sightings: count,
  wandered_off: count,
  /** Travellers who saw it and still missed it. */
  seen_by: z.array(z.uuid()),
  /** This critter's forms the crew found on the trip, of all its forms. */
  forms_found: count,
  forms_total: count,
  /** Its next open window after the trip, when it only comes in season. */
  next_window: z.strictObject({ from: localDate, to: localDate }).nullable(),
});
export type RecapGotAway = z.infer<typeof recapGotAwaySchema>;

// --- stats --------------------------------------------------------------------------------------

/** A stand-out stop: a plan item at a place that started before local sunrise. */
export const recapSuperlativeSchema = z.strictObject({
  kind: z.literal('before_sunrise'),
  poi_id: z.uuid(),
  name: z.string(),
  category: z.string().nullable(),
  day_no: z.int().min(1),
  local_date: localDate,
  local_time: localTime,
  /** Travellers whose visit to the place that day was detected (0 without visit data). */
  visited_by: count,
});
export type RecapSuperlative = z.infer<typeof recapSuperlativeSchema>;

export const recapBestDaySchema = z.strictObject({
  day_no: z.int().min(1),
  local_date: localDate,
  score: count,
});
export type RecapBestDay = z.infer<typeof recapBestDaySchema>;

export const recapStatsSchema = z.strictObject({
  start_date: localDate,
  end_date: localDate,
  days: z.int().min(1),
  travellers: z.int().min(1),
  distance_m: metres,
  distance_estimated: z.boolean(),
  superlatives: z.array(recapSuperlativeSchema),
  /** Album counts; null until the trip has an album to count. */
  photos: z
    .strictObject({
      count,
      top_uploader: z.strictObject({ user_id: z.uuid(), count }).nullable(),
    })
    .nullable(),
  critters: recapCrittersSchema,
  best_day: recapBestDaySchema.nullable(),
});
export type RecapStats = z.infer<typeof recapStatsSchema>;

// --- awards -------------------------------------------------------------------------------------

/** What each award is chosen on, one metric per evidence-based kind. */
export const AWARD_METRICS = {
  treasurer: 'expenses_logged',
  planner: 'plan_edits',
  early_riser: 'early_starts',
  critter_whisperer: 'finds',
  explorer: 'places_visited',
  best_find: 'revisits',
  navigator: 'rides_logged',
  human_camera: 'photos',
} as const;
export type EvidenceAwardKind = keyof typeof AWARD_METRICS;
export type AwardMetric = (typeof AWARD_METRICS)[EvidenceAwardKind];

/** The award for a traveller the numbers say nothing about. */
export const FALLBACK_AWARD_KIND = 'good_company' as const;

export const AWARD_KINDS = [
  ...(Object.keys(AWARD_METRICS) as EvidenceAwardKind[]),
  FALLBACK_AWARD_KIND,
] as const;
export const awardKindSchema = z.enum(AWARD_KINDS);
export type AwardKind = z.infer<typeof awardKindSchema>;

export const AWARD_METRIC_NAMES = [...Object.values(AWARD_METRICS), 'none'] as const;
export const awardMetricSchema = z.enum(AWARD_METRIC_NAMES);

/** Per-traveller counts the contributors gather; an award reads its metric from here. */
export type MemberMetrics = Partial<Record<AwardMetric, number>>;

/** The numbers an award's line may use, beyond its metric's value. */
export const recapAwardEvidenceSchema = z.strictObject({
  /** Earliest local start among the early starts (`early_riser`). */
  earliest_time: localTime.optional(),
  /** The place behind `best_find` and how many separate visits it got. */
  poi_id: z.uuid().optional(),
  poi_name: z.string().optional(),
  /** The traveller's share of the crew's total for the metric, in whole percent. */
  share_pct: z.int().min(0).max(100).optional(),
  /** The crew's total for the metric. */
  crew_total: count.optional(),
});
export type RecapAwardEvidence = z.infer<typeof recapAwardEvidenceSchema>;

export interface RecapAwardDraft {
  readonly user_id: string;
  readonly kind: AwardKind;
  readonly metric: z.infer<typeof awardMetricSchema>;
  readonly value: number;
  readonly evidence: RecapAwardEvidence;
}

/** The whole set the builder writes, before it is split into columns. */
export interface RecapContent {
  readonly stats: RecapStats;
  readonly route: RecapRoute;
  readonly receipt: RecapReceipt;
  readonly got_away: RecapGotAway | null;
  readonly awards: readonly RecapAwardDraft[];
}
