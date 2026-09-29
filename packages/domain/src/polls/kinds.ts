/**
 * The one Poll + Ballot engine's vocabulary (docs/data-model.md §3.3, docs/product-decisions.md
 * "one Poll+Ballot engine"): every vote in the app is a poll of one of these kinds. The SQL CHECK
 * lists in packages/db/migrations/*_polls_ballots_pitches.sql are copied from these arrays.
 */
import { z } from 'zod';

export const POLL_KINDS = [
  'destination',
  'generic',
  'day_option',
  'changeset_approval',
  'decision',
  'mvp',
] as const;
export const pollKindSchema = z.enum(POLL_KINDS);
export type PollKind = z.infer<typeof pollKindSchema>;

/** Only destination polls have stages: a pitch board, then a two-place final. */
export const POLL_STAGES = ['board', 'final'] as const;
export const pollStageSchema = z.enum(POLL_STAGES);
export type PollStage = z.infer<typeof pollStageSchema>;

export const POLL_STATUSES = ['open', 'closed', 'cancelled'] as const;
export const pollStatusSchema = z.enum(POLL_STATUSES);
export type PollStatus = z.infer<typeof pollStatusSchema>;

/**
 * Who decides an approval-style poll early (approval authority). `null` on a poll = plurality:
 * it closes when every eligible voter has voted or at `closes_at`.
 */
export const POLL_DECIDER_POLICIES = [
  'organiser',
  'any_affected',
  'majority_of_affected',
  'threshold_n',
] as const;
export const pollDeciderPolicySchema = z.enum(POLL_DECIDER_POLICIES);
export type PollDeciderPolicy = z.infer<typeof pollDeciderPolicySchema>;

/**
 * How a tie at close is broken: the destination final goes to the place that is cheaper for the
 * crew's majority origin on frozen quotes; a board tie is the organiser's pick; everything else
 * goes to the option that reached the winning count first.
 */
export const POLL_TIE_RULES = [
  'cheaper_for_majority_origin',
  'organiser_pick',
  'earliest_to_count',
] as const;
export const pollTieRuleSchema = z.enum(POLL_TIE_RULES);
export type PollTieRule = z.infer<typeof pollTieRuleSchema>;

export const POLL_OPTION_KINDS = [
  'destination',
  'poi',
  'changeset',
  'text',
  'date_window',
] as const;
export const pollOptionKindSchema = z.enum(POLL_OPTION_KINDS);
export type PollOptionKind = z.infer<typeof pollOptionKindSchema>;

/** Where a ballot came from: the app, the vote widget, a notification action or a Live Activity. */
export const BALLOT_SOURCES = ['app', 'widget', 'notification', 'la'] as const;
export const ballotSourceSchema = z.enum(BALLOT_SOURCES);
export type BallotSource = z.infer<typeof ballotSourceSchema>;

export const POLL_CLOSE_REASONS = ['all_voted', 'deadline', 'manual', 'decider'] as const;
export const pollCloseReasonSchema = z.enum(POLL_CLOSE_REASONS);
export type PollCloseReason = z.infer<typeof pollCloseReasonSchema>;

export const PITCH_STATUSES = [
  'pitched',
  'on_board',
  'queued',
  'final',
  'won',
  'back_in_deck',
] as const;
export const pitchStatusSchema = z.enum(PITCH_STATUSES);
export type PitchStatus = z.infer<typeof pitchStatusSchema>;

/** A chat poll asks one question with two to six answers. */
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;
export const POLL_QUESTION_MAX = 140;
export const POLL_OPTION_LABEL_MAX = 80;
/** The destination board holds at most this many places; the sticker layout is designed for 1–8. */
export const BOARD_MAX_CANDIDATES = 8;
/** The board closes this long after its first candidate unless the organiser moves it on sooner. */
export const BOARD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** The final runs this long once two places are left. */
export const FINAL_WINDOW_MS = 72 * 60 * 60 * 1000;
/** Reminders to voters who have not voted yet, this long before `closes_at` (timer slots). */
export const POLL_REMINDERS = [
  { slot: '24h', beforeMs: 24 * 60 * 60 * 1000 },
  { slot: '2h', beforeMs: 2 * 60 * 60 * 1000 },
] as const;

/** Which ballot source the command envelope's `actor.via` maps to. */
export function ballotSourceForVia(via: string): BallotSource {
  switch (via) {
    case 'widget':
    case 'app_intent':
      return 'widget';
    case 'notif_action':
      return 'notification';
    case 'la_intent':
      return 'la';
    default:
      return 'app';
  }
}
