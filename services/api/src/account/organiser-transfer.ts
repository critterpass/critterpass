/**
 * Who takes over a trip when its organiser closes their account (3n-9, open question 4 default):
 * another organiser keeps it as is; otherwise the longest-standing participant with RSVP in, else
 * the crew's longest-standing active member on the trip. A trip nobody else is on has no successor
 * (the preflight shows it as a sole-member trip). The new role reaches the crew through the synced
 * `trip_participants` row.
 */
import { appendDomainEvent } from '@cp/db';
import type pg from 'pg';

/** Trips the user organises that have not ended. */
const OPEN_TRIP_STATUSES_SQL = "t.status NOT IN ('post_trip', 'archived', 'cancelled')";

export interface OrganisedTrip {
  readonly tripId: string;
  readonly crewId: string;
  readonly tripName: string | null;
  readonly transferTo: string | null;
  readonly soleMember: boolean;
  readonly coOrganised: boolean;
}

export async function organisedTrips(tx: pg.PoolClient, uid: string): Promise<OrganisedTrip[]> {
  const { rows } = await tx.query<{
    trip_id: string;
    crew_id: string;
    trip_name: string | null;
    co_organised: boolean;
    successor: string | null;
    others: number;
  }>(
    `SELECT t.id AS trip_id, t.crew_id, d.name AS trip_name,
            EXISTS (SELECT 1 FROM trip_participants o WHERE o.trip_id = t.id AND o.user_id <> $1
                      AND o.role = 'organiser') AS co_organised,
            (SELECT p.user_id FROM trip_participants p
               JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = p.user_id
                                  AND m.status = 'active'
              WHERE p.trip_id = t.id AND p.user_id <> $1
              ORDER BY (p.rsvp = 'in') DESC, p.created_at, m.created_at LIMIT 1) AS successor,
            (SELECT count(*)::int FROM crew_members m WHERE m.crew_id = t.crew_id
               AND m.status = 'active' AND m.user_id <> $1) AS others
       FROM trip_participants me
       JOIN trips t ON t.id = me.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE me.user_id = $1 AND me.role = 'organiser' AND ${OPEN_TRIP_STATUSES_SQL}
      ORDER BY t.created_at`,
    [uid],
  );
  return rows.map((row) => ({
    tripId: row.trip_id,
    crewId: row.crew_id,
    tripName: row.trip_name,
    transferTo: row.co_organised ? null : row.successor,
    soleMember: row.others === 0,
    coOrganised: row.co_organised,
  }));
}

/** Hands every open trip the user organises alone to its successor; returns the hand-overs. */
export async function transferOrganiserRoles(
  tx: pg.PoolClient,
  uid: string,
): Promise<OrganisedTrip[]> {
  const trips = await organisedTrips(tx, uid);
  const moved: OrganisedTrip[] = [];
  for (const trip of trips) {
    if (trip.coOrganised || trip.transferTo === null) continue;
    await tx.query(
      "UPDATE trip_participants SET role = 'organiser' WHERE trip_id = $1 AND user_id = $2",
      [trip.tripId, trip.transferTo],
    );
    await tx.query(
      "UPDATE trip_participants SET role = 'member' WHERE trip_id = $1 AND user_id = $2",
      [trip.tripId, uid],
    );
    await appendDomainEvent(tx, {
      type: 'trip.organiser_transferred',
      aggregateKind: 'trip',
      aggregateId: trip.tripId,
      actorKind: 'system',
      actorId: null,
      crewId: trip.crewId,
      tripId: trip.tripId,
      payload: {
        trip_id: trip.tripId,
        from_id: uid,
        to_id: trip.transferTo,
        reason: 'account_closed',
      },
    });
    moved.push(trip);
  }
  // A crew-level organiser role goes to the longest-standing active member the same way.
  await tx.query(
    `UPDATE crew_members m SET role = 'organiser'
      WHERE m.id IN (
        SELECT DISTINCT ON (me.crew_id) other.id
          FROM crew_members me
          JOIN crew_members other ON other.crew_id = me.crew_id AND other.user_id <> $1
                                  AND other.status = 'active'
         WHERE me.user_id = $1 AND me.role = 'organiser'
           AND NOT EXISTS (SELECT 1 FROM crew_members o WHERE o.crew_id = me.crew_id
                             AND o.user_id <> $1 AND o.role = 'organiser' AND o.status = 'active')
         ORDER BY me.crew_id, other.created_at)`,
    [uid],
  );
  return moved;
}
