/**
 * Names the drafting pipeline shares across api, worker and app: its queues, the steps of each job
 * (the ids in `agent_jobs.steps`), the realtime hints on `trip_draft:{trip_id}` and `trip:{trip_id}`
 * (docs/api-contracts-async.md §1.2), and the labels the drafting screen shows for each step.
 *
 * A step's label is a key plus the numbers and names the step found, filled in by the step when
 * it finishes, so a row never claims more than the work did: no availability, price or
 * cancellation claim is ever a label.
 */
import { z } from 'zod';

export const DRAFT_QUEUES = { draft: 'ai.draft', redraft: 'ai.redraft' } as const;

/** `ai.draft` steps, in order. */
export const DRAFT_STEP_IDS = [
  'read_profiles',
  'check_season',
  'skeleton',
  'days',
  'validate',
  'persist',
] as const;
export type DraftStepId = (typeof DRAFT_STEP_IDS)[number];

/** `ai.redraft` steps, in order. */
export const REDRAFT_STEP_IDS = ['reserve', 'load', 'redraft', 'diff', 'persist'] as const;
export type RedraftStepId = (typeof REDRAFT_STEP_IDS)[number];

/** Hints on `trip_draft:{trip_id}` (organisers only). */
export const DRAFT_RT = {
  step: 'draft.step',
  dayTitle: 'draft.day_title',
  done: 'draft.done',
  redraftResult: 'redraft.result',
} as const;

/** The crew-wide redraft counter on `trip:{trip_id}`. */
export const REDRAFT_COUNTER_RT = 'redraft.counter';

/**
 * Label keys, one per finished step (i18n `plan-draft.step.<key>`):
 * - `read_profiles` "Read {n} taste profiles"
 * - `season` "Checked the {signal}" / `season_none` "Checked the season"
 * - `stays` "Picked {n} {stay_type}s in {area}" / `days_planned` "Planned {n} days"
 * - `balance` "Balancing {early} early birds and {late} night owls" / `pace` "Setting the pace"
 * - `food` "Finding {dietary} {food} for {name}" / `hours` "Checking opening hours"
 * - `saved` "Your draft is ready"
 */
export const DRAFT_STEP_LABEL_KEYS = [
  'read_profiles',
  'season',
  'season_none',
  'stays',
  'days_planned',
  'balance',
  'pace',
  'food',
  'hours',
  'saved',
] as const;
export type DraftStepLabelKey = (typeof DRAFT_STEP_LABEL_KEYS)[number];

export const draftStepLabelSchema = z.object({
  key: z.enum(DRAFT_STEP_LABEL_KEYS),
  params: z.record(z.string(), z.union([z.string().max(80), z.number().int()])),
});
export type DraftStepLabel = z.infer<typeof draftStepLabelSchema>;

/** `draft.step`: one step started, finished or failed (the label arrives with `done`). */
export const draftStepHintSchema = z.object({
  job_id: z.uuid(),
  step: z.string().min(1),
  status: z.enum(['running', 'done', 'failed']),
  label: draftStepLabelSchema.nullable(),
  /** A short machine reason on `failed` (`model_unavailable`, `no_places`, ...). */
  reason: z.string().max(80).nullable(),
});
export type DraftStepHint = z.infer<typeof draftStepHintSchema>;

/** `draft.day_title`: a day's theme once the skeleton has it, then again once the day is built. */
export const draftDayTitleHintSchema = z.object({
  job_id: z.uuid(),
  day_no: z.number().int().positive(),
  theme: z.string().min(1).max(80),
  stops: z.number().int().nonnegative().nullable(),
});
export type DraftDayTitleHint = z.infer<typeof draftDayTitleHintSchema>;

/** `draft.done`: the job ended; the version itself arrives through sync. */
export const draftDoneHintSchema = z.object({
  job_id: z.uuid(),
  status: z.enum(['succeeded', 'failed', 'cancelled']),
  version_id: z.uuid().nullable(),
});
export type DraftDoneHint = z.infer<typeof draftDoneHintSchema>;

/** `redraft.counter`: redrafts used on the trip, for every participant's counter. */
export const redraftCounterHintSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive().nullable(),
});
export type RedraftCounterHint = z.infer<typeof redraftCounterHintSchema>;
