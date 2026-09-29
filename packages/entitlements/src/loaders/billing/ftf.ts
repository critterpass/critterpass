/**
 * First trip free: Boost on the crew's first trip, and Pass+ for everyone taking part in it, until
 * the trip's end + 7 days. A grant ops revoked for abuse counts for nobody.
 */
import type { FtfSource } from '../../sources';
import { iso, type RunQuery } from './query';

interface Row {
  readonly crew_id: string;
  readonly trip_id: string;
  readonly starts_at: Date;
  readonly ends_at: Date;
}

const toSource = (row: Row): FtfSource => ({
  kind: 'ftf',
  crewId: row.crew_id,
  tripId: row.trip_id,
  startsAt: iso(row.starts_at),
  endsAt: iso(row.ends_at),
});

/** The grants of trips the user takes part in (RSVP not out, still in the crew). */
export async function loadUserFtfSources(run: RunQuery, uid: string): Promise<FtfSource[]> {
  const rows = await run<Row>(
    `SELECT g.crew_id, g.trip_id, g.starts_at, g.ends_at FROM ftf_grants g
       JOIN trip_participants tp ON tp.trip_id = g.trip_id AND tp.user_id = $1 AND tp.rsvp <> 'out'
       JOIN crew_members m ON m.crew_id = g.crew_id AND m.user_id = $1 AND m.status = 'active'
      WHERE g.abuse_decision <> 'revoked'`,
    [uid],
  );
  return rows.map(toSource);
}

export async function loadTripFtfSources(run: RunQuery, tripId: string): Promise<FtfSource[]> {
  const rows = await run<Row>(
    `SELECT crew_id, trip_id, starts_at, ends_at FROM ftf_grants
      WHERE trip_id = $1 AND abuse_decision <> 'revoked'`,
    [tripId],
  );
  return rows.map(toSource);
}
