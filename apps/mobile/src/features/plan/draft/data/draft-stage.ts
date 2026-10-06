/**
 * Where a trip is with its draft, read from the trip's status and never from whether it has a
 * draft version: a trip gets its days (an organiser-only version with no stops, or the plan she
 * builds on them by hand) as soon as its dates lock, long before the guide drafts anything.
 */

/** Before these are over the trip's version, if it has one, is only its days: nothing to review. */
const BEFORE_A_DRAFT: ReadonlySet<string> = new Set(['voting', 'won', 'setup', 'drafting']);

/** There is a draft to review (the guide's, or the plan she built and took on to review). */
export function hasDraftToReview(trip: {
  readonly status: string;
  readonly draftVersionId: string | null;
}): boolean {
  return trip.draftVersionId !== null && !BEFORE_A_DRAFT.has(trip.status);
}

/**
 * The guide is drafting the trip for this organiser right now: the review hands over to the
 * drafting screen.
 */
export function isBeingDrafted(
  trip: {
    readonly isOrganiser: boolean;
    readonly status: string;
    readonly draftVersionId: string | null;
  },
  lastDraftJob: { readonly status: string } | null,
): boolean {
  const live = lastDraftJob?.status === 'queued' || lastDraftJob?.status === 'running';
  return trip.isOrganiser && live && !hasDraftToReview(trip);
}

/** Statuses a trip has once its plan is locked in. */
/* eslint-disable lingui/no-unlocalized-strings -- trip statuses, never copy. */
const LOCKED_IN: ReadonlySet<string> = new Set([
  'confirmed',
  'pre_trip',
  'in_trip',
  'post_trip',
  'archived',
]);
/* eslint-enable lingui/no-unlocalized-strings */

/**
 * The plan is locked in, so the private draft is retired and the crew's plan is what to show. The
 * lock's rows can sync after she has already opened the draft, so the review follows the status.
 */
export function isDraftRetired(trip: { readonly status: string }): boolean {
  return LOCKED_IN.has(trip.status);
}
