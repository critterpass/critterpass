/**
 * What Home renders, derived from synced rows only (docs/product-decisions.md: Home is
 * crew-scoped). Every input is optional data a later feature fills: with no poll the vote slot is
 * null, with no flights the countdown targets the trip's first day, so Home always has a mode.
 */
import type { TripStatus } from '../enums/trip';

export const HOME_MODES = [
  'first_run',
  'everyday',
  'final_vote',
  'no_trip',
  'in_trip',
  'post_trip',
] as const;
export type HomeMode = (typeof HOME_MODES)[number];

/** One trip of the Home crew as the synced `trips` row (plus its destination) describes it. */
export interface HomeTripInput {
  readonly id: string;
  readonly status: TripStatus;
  /** `YYYY-MM-DD` in the trip's zone. */
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** The trip's zone, else its destination's. */
  readonly tz: string | null;
  readonly destinationId: string | null;
  readonly destinationName: string | null;
  /** The destination's slug (its editorial media's subject); absent where nothing reads media. */
  readonly destinationSlug?: string | null;
  readonly guideId: string | null;
  /** 0–100 (`trips.plan_progress`). */
  readonly planProgress: number;
  /** The viewer's `trip_participants.countdown_target_at`, when the server has computed it. */
  readonly countdownTargetAt: string | null;
}

/**
 * The destination poll slot. The poll feature supplies the query and the component through
 * `apps/mobile/src/features/home/slots.ts`; Home only reads the stage to pick its mode.
 */
export interface HomeVoteSlot {
  readonly pollId: string;
  readonly stage: 'board' | 'final';
  readonly candidates: readonly { readonly placeId: string; readonly votes: number }[];
  readonly votersIn: number;
  readonly memberCount: number;
  readonly closesAt: string | null;
}

export interface HomeModeInput {
  readonly hasCrew: boolean;
  readonly trips: readonly HomeTripInput[];
  readonly vote: HomeVoteSlot | null;
  readonly now: Date;
}

export interface HomeState {
  readonly mode: HomeMode;
  /** The trip the next-up card counts down to (everyday, final vote). */
  readonly nextTrip: HomeTripInput | null;
  /** The trip under way (in trip). */
  readonly activeTrip: HomeTripInput | null;
  /** The trip that just ended, within the recap window (post trip). */
  readonly recentTrip: HomeTripInput | null;
  /** The last trip that ran, for the no-trip card's stamp. */
  readonly lastTrip: HomeTripInput | null;
  readonly vote: HomeVoteSlot | null;
}

/** Trip statuses that are still ahead of the crew. */
export const UPCOMING_TRIP_STATUSES: ReadonlySet<TripStatus> = new Set<TripStatus>([
  'voting',
  'won',
  'setup',
  'drafting',
  'draft_review',
  'redrafting',
  'proposed',
  'confirmed',
  'pre_trip',
]);

/** How long after its last day a trip keeps Home in post-trip mode. */
export const POST_TRIP_HOME_DAYS = 14;
