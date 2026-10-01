/**
 * Poll, trip-creation and saved-place command payloads and results (docs/api-contracts.md §4.3,
 * §4.4), shared by the api handlers and the app's command writers.
 */
import { z } from 'zod';

import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_LABEL_MAX,
  POLL_QUESTION_MAX,
  pollDeciderPolicySchema,
  type PitchStatus,
  type PollStage,
  type PollStatus,
} from './kinds';

const month = z.int().min(1).max(12);

export const createTripPayloadSchema = z.strictObject({
  /** Client-chosen id, so an offline create lands on one row. */
  trip_id: z.uuid().optional(),
  crew_id: z.uuid().optional(),
  place_id: z.uuid(),
  solo: z.boolean(),
  pitch_id: z.uuid().optional(),
  month: month.optional(),
});
export type CreateTripPayload = z.infer<typeof createTripPayloadSchema>;

const pollOptionInputSchema = z.strictObject({
  label: z.string().trim().min(1).max(POLL_OPTION_LABEL_MAX),
  kind: z.enum(['text', 'poi', 'date_window', 'changeset']).default('text'),
  ref_id: z.uuid().optional(),
});

export const createPollPayloadSchema = z
  .strictObject({
    poll_id: z.uuid().optional(),
    crew_id: z.uuid(),
    trip_id: z.uuid().optional(),
    kind: z.enum(['generic', 'day_option', 'changeset_approval', 'decision']),
    question: z.string().trim().min(1).max(POLL_QUESTION_MAX),
    options: z.array(pollOptionInputSchema).min(POLL_MIN_OPTIONS).max(POLL_MAX_OPTIONS),
    closes_at: z.iso.datetime({ offset: true }).optional(),
    allow_change: z.boolean().default(true),
    decider_policy: pollDeciderPolicySchema.optional(),
    threshold: z.int().min(1).optional(),
    affected_user_ids: z.array(z.uuid()).max(64).optional(),
  })
  .refine((p) => (p.decider_policy === 'threshold_n') === (p.threshold !== undefined), {
    message: 'threshold goes with threshold_n',
    path: ['threshold'],
  })
  .refine((p) => new Set(p.options.map((o) => o.label.toLowerCase())).size === p.options.length, {
    message: 'options must differ',
    path: ['options'],
  });
export type CreatePollPayload = z.infer<typeof createPollPayloadSchema>;

export const addPollCandidatePayloadSchema = z.strictObject({
  crew_id: z.uuid(),
  poll_id: z.uuid().optional(),
  place_id: z.uuid(),
  pitch_id: z.uuid().optional(),
  month: month.optional(),
  /** Used when this candidate starts a new vote (the trip it creates). */
  trip_id: z.uuid().optional(),
});
export type AddPollCandidatePayload = z.infer<typeof addPollCandidatePayloadSchema>;

export const castBallotPayloadSchema = z.strictObject({ poll_id: z.uuid(), option_id: z.uuid() });
export type CastBallotPayload = z.infer<typeof castBallotPayloadSchema>;

const pollOnly = z.strictObject({ poll_id: z.uuid() });
export const retractBallotPayloadSchema = pollOnly;
export const closePollPayloadSchema = pollOnly;
export const markRevealSeenPayloadSchema = pollOnly;
export const reopenBoardPayloadSchema = pollOnly;

export const advancePollStagePayloadSchema = z.strictObject({
  poll_id: z.uuid(),
  /** The organiser's choice for a tied final spot. */
  pick: z.array(z.uuid()).min(1).max(2).optional(),
});
export type AdvancePollStagePayload = z.infer<typeof advancePollStagePayloadSchema>;

export const removeCandidatePayloadSchema = z.strictObject({
  poll_id: z.uuid(),
  option_id: z.uuid(),
});

export const queuePitchPayloadSchema = z.strictObject({ crew_id: z.uuid(), pitch_id: z.uuid() });

/** A destination (kind `place`) or a place page's POI (kind `poi`), optionally into a named list. */
export const savePlacePayloadSchema = z.strictObject({
  place_id: z.uuid(),
  list_name: z.string().trim().min(1).max(60).optional(),
});

export const requestPlacePayloadSchema = z.strictObject({
  query: z.string().trim().min(2).max(80),
});

/** What every ballot surface gets back: the counts to stamp or animate. */
export interface PollTallyResult {
  readonly poll_id: string;
  readonly status: PollStatus;
  readonly stage: PollStage | null;
  readonly option_tallies: Readonly<Record<string, number>>;
  readonly pending_count: number;
  readonly eligible_count: number;
  readonly my_option_id: string | null;
  readonly winner_option_id: string | null;
}

export type PitchToCrewOutcome = 'board_created' | 'added' | 'already_on_board' | 'queued';

export interface PitchToCrewResult {
  readonly outcome: PitchToCrewOutcome;
  readonly crew_id: string;
  readonly poll_id: string | null;
  readonly trip_id: string | null;
  readonly option_id: string | null;
  readonly pitch_id: string;
  readonly pitch_status: PitchStatus;
  /** "{in} of {n} have voted" for the toast. */
  readonly voted: number;
  readonly eligible: number;
}

export interface CreateTripResult {
  readonly trip_id: string;
  readonly status: 'voting' | 'setup';
  readonly poll_id: string | null;
  readonly solo: boolean;
  /** First-trip-free applies to crew trips only; solo trips can Boost. */
  readonly ftf_eligible: boolean;
}
