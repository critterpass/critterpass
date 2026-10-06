/**
 * `places.trip_refresh`: rewrites one trip's `trip_places` cards (`app.refresh_trip_places`) after an
 * event that can add or drop a place the trip uses: a plan change, a draft, an idea saved or
 * removed, must-dos changed, a swipe deck built or ended. Whichever process appends the event
 * queues the refresh in the same transaction (the api and the worker each register the hook).
 * Keyed by trip under `stately`: one run at a time per trip and one waiting, and the waiting one
 * starts after a short delay, so a burst of edits folds into one refresh.
 */
import { z } from 'zod';

import { PLACES_QUEUES } from './queues';

export const TRIP_PLACES_REFRESH_QUEUE = PLACES_QUEUES.tripRefresh;

/** Seconds a refresh waits, so the edits of one burst land in one run. */
export const TRIP_PLACES_REFRESH_DELAY_S = 2;

/** Events after which a trip may use a different set of places. */
export const TRIP_PLACE_EVENTS = [
  'plan.version_created',
  'plan.ops_applied',
  'change_set.applied',
  'change_set.reverted',
  'draft.ready',
  'draft.ops_applied',
  'draft.version_restored',
  'redraft.delivered',
  'redraft.kept',
  'redraft.reverted',
  'trip_idea.saved',
  'trip_idea.removed',
  'ideas.placed',
  'must_dos.changed',
  'swipe.deck_ready',
  'swipe.ended',
] as const;
const EVENTS: ReadonlySet<string> = new Set(TRIP_PLACE_EVENTS);

export function isTripPlaceEvent(type: string): boolean {
  return EVENTS.has(type);
}

export const tripPlacesRefreshJobSchema = z.object({ trip_id: z.uuid() });
export type TripPlacesRefreshJob = z.infer<typeof tripPlacesRefreshJobSchema>;

export interface TripPlacesRefreshSend {
  readonly queue: typeof TRIP_PLACES_REFRESH_QUEUE;
  readonly data: TripPlacesRefreshJob;
  readonly options: { readonly singletonKey: string; readonly startAfter: number };
}

/** The refresh an appended event asks for, or null when it cannot change the trip's places. */
export function tripPlacesRefreshFor(event: {
  readonly type: string;
  readonly tripId: string | null;
}): TripPlacesRefreshSend | null {
  if (event.tripId === null || !isTripPlaceEvent(event.type)) return null;
  return {
    queue: TRIP_PLACES_REFRESH_QUEUE,
    data: { trip_id: event.tripId },
    options: { singletonKey: event.tripId, startAfter: TRIP_PLACES_REFRESH_DELAY_S },
  };
}
