/**
 * When the app may ask the store for a rating, and what the end of a recap shows. The system
 * prompt is asked for only after a trip that ended well: its recap watched to the end, no
 * disruption left open on it, no unhappy feedback (GRR or MEH) in the last 30 days, no trip under
 * way, no error in the last ten minutes, no paywall and no other end-of-recap card in this session,
 * and never within 120 days of the last ask. The recap end hosts one moment at most, in priority
 * order: the free-trip ending card, then rate-the-trip, then the store's prompt.
 */
import type { FeedbackMood } from './schemas';

export const RATING_PROMPT_GAP_DAYS = 120;
export const RATING_UNHAPPY_WINDOW_DAYS = 30;
export const RATING_ERROR_QUIET_MINUTES = 10;

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const UNHAPPY: ReadonlySet<FeedbackMood> = new Set(['grr', 'meh']);

export interface RatingFacts {
  readonly now: Date;
  /** The recap story ran to its last page. */
  readonly recapViewedToEnd: boolean;
  /** A disruption on the recap's trip is still open. */
  readonly tripHasOpenDisruption: boolean;
  /** Any of the traveller's trips is under way. */
  readonly tripActive: boolean;
  /** Moods the traveller sent with feedback, with when. */
  readonly feedbackMoods: readonly { readonly mood: FeedbackMood; readonly at: Date }[];
  readonly lastErrorAt: Date | null;
  /** A paywall was shown in this app session. */
  readonly paywallThisSession: boolean;
  /** The free-trip ending card or the rate-the-trip toast surfaced in this recap session. */
  readonly otherRecapCardThisSession: boolean;
  /** The last time the app asked the store for a rating (any trip). */
  readonly lastPromptAt: Date | null;
}

export type RatingVerdict =
  | { readonly ask: true }
  | {
      readonly ask: false;
      readonly reason:
        | 'recap_unfinished'
        | 'open_disruption'
        | 'trip_active'
        | 'unhappy_feedback'
        | 'recent_error'
        | 'paywall_session'
        | 'other_card'
        | 'asked_recently';
    };

/** Whether the store's rating prompt may be asked for now; the first rule that fails says why. */
export function ratingVerdict(facts: RatingFacts): RatingVerdict {
  const now = facts.now.getTime();
  if (!facts.recapViewedToEnd) return { ask: false, reason: 'recap_unfinished' };
  if (facts.tripHasOpenDisruption) return { ask: false, reason: 'open_disruption' };
  if (facts.tripActive) return { ask: false, reason: 'trip_active' };
  const unhappySince = now - RATING_UNHAPPY_WINDOW_DAYS * DAY_MS;
  if (facts.feedbackMoods.some((m) => UNHAPPY.has(m.mood) && m.at.getTime() >= unhappySince)) {
    return { ask: false, reason: 'unhappy_feedback' };
  }
  if (
    facts.lastErrorAt !== null &&
    now - facts.lastErrorAt.getTime() < RATING_ERROR_QUIET_MINUTES * MINUTE_MS
  ) {
    return { ask: false, reason: 'recent_error' };
  }
  if (facts.paywallThisSession) return { ask: false, reason: 'paywall_session' };
  if (facts.otherRecapCardThisSession) return { ask: false, reason: 'other_card' };
  if (
    facts.lastPromptAt !== null &&
    now - facts.lastPromptAt.getTime() < RATING_PROMPT_GAP_DAYS * DAY_MS
  ) {
    return { ask: false, reason: 'asked_recently' };
  }
  return { ask: true };
}

export type RecapEndMoment = 'ftf_ending' | 'rate_trip' | 'store_review';

/** The one moment the recap end shows, by priority; null when none applies. */
export function recapEndMoment(input: {
  readonly ftfEnding: boolean;
  readonly rateTripDue: boolean;
  readonly rating: RatingVerdict;
}): RecapEndMoment | null {
  if (input.ftfEnding) return 'ftf_ending';
  if (input.rateTripDue) return 'rate_trip';
  return input.rating.ask ? 'store_review' : null;
}
