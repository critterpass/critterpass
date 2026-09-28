/**
 * Closing the crew map for a trip: every open crew-map share ends, each announced with
 * `share.ended`, and every participant and crew member is unsubscribed from
 * `trip_locations:{trip_id}` (`app.revoke_crew_map`). Membership changes and Boost ending do the
 * same in their own transactions through database triggers; this is the path for the window
 * closing at last-day midnight, which no row change marks. The active meet-up is over too.
 */
import type pg from 'pg';

export type CrewMapCloseReason = 'window_ended' | 'boost_ended' | 'member_left';

export async function closeCrewMap(
  tx: pg.PoolClient,
  tripId: string,
  reason: CrewMapCloseReason,
): Promise<void> {
  await tx.query('SELECT app.revoke_crew_map($1, NULL, $2)', [tripId, reason]);
  await tx.query("UPDATE meetups SET status = 'done' WHERE trip_id = $1 AND status = 'active'", [
    tripId,
  ]);
}
