/**
 * Who may subscribe to `trip_locations:{trip_id}`: a participant of the trip (still in the crew, not
 * answered `out` unless organising) while the crew map is open (boosted, trip days, before
 * last-day midnight). Nothing else: a viewer need not share to see the crew. Run as `app_user` with
 * `app.uid` set and the trip id as `$1`, so the subscribe proxy, the live snapshot and RLS share
 * one predicate (`app.can_view_crew_map`).
 */
export const CREW_MAP_CHANNEL_NAMESPACE = 'trip_locations';

export const CREW_MAP_CHANNEL_ACL_SQL = 'SELECT app.can_view_crew_map($1::uuid) AS allowed';

export function crewMapChannel(tripId: string): string {
  return `${CREW_MAP_CHANNEL_NAMESPACE}:${tripId}`;
}
