/**
 * When a place fits the trip's days (docs/api-contracts-planning.md): a grade per day, the best
 * slot, and the reasons behind it. Reasons are codes with the numbers and ids the app words from
 * its own templates; no reason ever carries words, so the phone, the server and the guide agree on
 * what a fit says and every language reads it the same way. The engine is
 * `packages/planner/src/fit`; `trip_ideas.fit` stores its result for each idea.
 */
import { z } from 'zod';

/** A local wall-clock time, `HH:MM`. */
export const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u, 'HH:MM');

export const FIT_GRADES = ['good', 'possible', 'no'] as const;
export const fitGradeSchema = z.enum(FIT_GRADES);
export type FitGrade = z.infer<typeof fitGradeSchema>;

/** Where a time or a forecast came from, so copy can name its source truthfully. */
export const FIT_WEATHER_SOURCES = ['forecast', 'normals'] as const;
export const fitWeatherSourceSchema = z.enum(FIT_WEATHER_SOURCES);
export const CROWD_READ_SOURCES = ['visits', 'editorial'] as const;
export const crowdReadSourceSchema = z.enum(CROWD_READ_SOURCES);

const minutes = z
  .number()
  .int()
  .min(0)
  .max(24 * 60);
const percent = z.number().int().min(0).max(100);
const dayNo = z.number().int().min(1).max(366);
const reason = <C extends string, P extends z.ZodRawShape>(code: C, params: P) =>
  z.strictObject({ code: z.literal(code), params: z.strictObject(params) });

export const fitReasonSchema = z.discriminatedUnion('code', [
  reason('opens_at', { time: clockTimeSchema }),
  reason('closes_at', { time: clockTimeSchema }),
  reason('hours_unknown', {}),
  reason('closed_that_day', { day_no: dayNo }),
  reason('no_window', { day_no: dayNo }),
  reason('travel_day', { day_no: dayNo, kind: z.enum(['arrival', 'departure']) }),
  reason('busy_from', { time: clockTimeSchema, level: percent, source: crowdReadSourceSchema }),
  reason('quiet_until', { time: clockTimeSchema, source: crowdReadSourceSchema }),
  reason('drive_minutes', {
    minutes,
    from: z.enum(['stay', 'item', 'poi']),
    stable_id: z.uuid().optional(),
    approx: z.boolean(),
  }),
  reason('walk_minutes', {
    minutes,
    from: z.enum(['stay', 'item', 'poi']),
    stable_id: z.uuid().optional(),
    approx: z.boolean(),
  }),
  reason('ride_works', { minutes, approx: z.boolean() }),
  reason('on_the_way', { stable_id: z.uuid(), detour_minutes: minutes }),
  reason('rain_likely', {
    from: clockTimeSchema,
    to: clockTimeSchema,
    pct: percent,
    source: fitWeatherSourceSchema,
  }),
  reason('dry_window', {
    from: clockTimeSchema,
    to: clockTimeSchema,
    source: fitWeatherSourceSchema,
  }),
  reason('dry_mornings', { source: fitWeatherSourceSchema }),
  reason('free_day', { day_no: dayNo }),
  reason('first_night', { day_no: dayNo }),
  reason('after_item', { stable_id: z.uuid() }),
  reason('before_item', { stable_id: z.uuid() }),
  reason('booked_nearby', { stable_id: z.uuid(), minutes }),
  reason('who_free', { user_ids: z.array(z.uuid()).min(1).max(50) }),
  reason('needs_move', { stable_id: z.uuid() }),
  reason('crew_split', { want: z.number().int().min(0), rather_not: z.number().int().min(0) }),
  reason('cheapest_of', { count: z.number().int().min(2) }),
  /** The editorial best-time line, shown verbatim from the place's own editorial copy. */
  reason('editorial_best_time', {}),
]);
export type FitReason = z.infer<typeof fitReasonSchema>;
export type FitReasonCode = FitReason['code'];
export const FIT_REASON_CODES = fitReasonSchema.options.map(
  (option) => option.shape.code.value,
) as readonly FitReasonCode[];

export const fitSlotSchema = z.strictObject({
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
});
export type FitSlot = z.infer<typeof fitSlotSchema>;

export const dayFitSchema = z.strictObject({
  day_id: z.uuid(),
  day_no: dayNo,
  grade: fitGradeSchema,
  slot: fitSlotSchema.nullable(),
  reasons: z.array(fitReasonSchema).max(12),
  insert_after: z.uuid().nullable().optional(),
  insert_before: z.uuid().nullable().optional(),
  detour_minutes: minutes.nullable().optional(),
  needs_move: z.uuid().nullable().optional(),
});
export type DayFit = z.infer<typeof dayFitSchema>;

/** One place's fit across the trip's days; `best` is null when no day fits. */
export const placeFitSchema = z.strictObject({
  poi_id: z.uuid().nullable(),
  best: z
    .strictObject({ day_id: z.uuid(), day_no: dayNo, grade: fitGradeSchema, slot: fitSlotSchema })
    .nullable(),
  days: z.array(dayFitSchema).max(60),
});
export type PlaceFit = z.infer<typeof placeFitSchema>;

/** What `trip_ideas.fit` holds: the place fit plus the plan version it was worked out against. */
export const storedFitSchema = placeFitSchema.extend({
  version_id: z.uuid(),
  computed_at: z.iso.datetime({ offset: true }),
});
export type StoredFit = z.infer<typeof storedFitSchema>;
