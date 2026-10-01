/**
 * Whether a `/{tripId}/...` route has a trip behind it. The route matches any first path segment,
 * so a segment that is no trip id is an unknown link; and a real id can name a trip this person
 * cannot read (never joined, removed, or mistyped), which never syncs a row. Both get the
 * not-found page with its way home instead of a trip screen with nothing behind it. An id is only
 * called missing once the phone has heard from the server: until then the screens keep their own
 * loading states, and a trip already on the phone opens at once, offline too.
 */
const TRIP_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** A trip id is a UUID; anything else in its place is not a trip route at all. */
export function isTripId(segment: unknown): segment is string {
  return typeof segment === 'string' && TRIP_ID.test(segment);
}

export type TripAccess = 'checking' | 'readable' | 'missing';

/**
 * `hasRow` is the local lookup (null while it runs); `heard` is true once the trip's own stream
 * and the account's sync have both come back from the server.
 */
export function tripAccess(hasRow: boolean | null, heard: boolean): TripAccess {
  if (hasRow === true) return 'readable';
  return hasRow === false && heard ? 'missing' : 'checking';
}
