/**
 * Reads everything the widget snapshot shows for one viewer, inside their own `withUser`
 * transaction: row security is what keeps another member's private rows out. The trip is the one
 * asked for, else the viewer's trip under way, else their next one. Perk-gated sections are only
 * read when the viewer has the perk.
 */
import {
  buildWidgetSnapshot,
  DomainError,
  etaBucket,
  widgetInitial,
  type WidgetSnapshot,
  type WidgetSnapshotInput,
} from '@cp/domain';
import type pg from 'pg';

import { loadBalance, loadToday } from './snapshot-today';

export type Trip = NonNullable<WidgetSnapshotInput['trip']>;

const TRIP_COLUMNS = `t.id, d.name AS destination, t.status, t.start_date::text AS start_date,
  t.end_date::text AS end_date, coalesce(t.tz, d.tz) AS tz`;

async function loadTrip(
  tx: pg.PoolClient,
  uid: string,
  tripId: string | undefined,
): Promise<Trip | null> {
  if (tripId !== undefined) {
    const { rows } = await tx.query<Trip>(
      `SELECT ${TRIP_COLUMNS} FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE t.id = $1`,
      [tripId],
    );
    if (rows[0] === undefined) throw new DomainError('NOT_FOUND', { resource: 'trip' });
    return rows[0];
  }
  const { rows } = await tx.query<Trip>(
    `SELECT ${TRIP_COLUMNS} FROM trip_participants tp
       JOIN trips t ON t.id = tp.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE tp.user_id = $1 AND tp.rsvp NOT IN ('out', 'waitlisted')
        AND t.status NOT IN ('post_trip', 'archived', 'cancelled')
      ORDER BY (t.status = 'in_trip') DESC, t.start_date ASC NULLS LAST, t.created_at DESC
      LIMIT 1`,
    [uid],
  );
  return rows[0] ?? null;
}

async function loadVote(tx: pg.PoolClient, uid: string, tripId: string) {
  const { rows } = await tx.query<{
    id: string;
    question: string | null;
    status: string;
    closes_at: Date | null;
    eligible: number;
    winner_option_id: string | null;
  }>(
    `SELECT id, question, status, closes_at, cardinality(eligible_voter_ids) AS eligible,
            winner_option_id
       FROM polls
      WHERE trip_id = $1
        AND (status = 'open' OR (status = 'closed' AND closed_at > now() - interval '24 hours'))
      ORDER BY (status = 'open') DESC, closes_at ASC NULLS LAST, closed_at DESC
      LIMIT 1`,
    [tripId],
  );
  const poll = rows[0];
  if (poll === undefined) return null;
  const options = await tx.query<{ id: string; label: string; votes: number }>(
    `SELECT o.id, o.label, count(b.id)::int AS votes
       FROM poll_options o LEFT JOIN ballots b ON b.option_id = o.id AND b.poll_id = o.poll_id
      WHERE o.poll_id = $1 AND o.eliminated_at IS NULL
      GROUP BY o.id ORDER BY o.position LIMIT 6`,
    [poll.id],
  );
  const mine = await tx.query<{ option_id: string }>(
    'SELECT option_id FROM ballots WHERE poll_id = $1 AND user_id = $2',
    [poll.id, uid],
  );
  return {
    poll_id: poll.id,
    question: poll.question,
    status: poll.status === 'open' ? ('open' as const) : ('closed' as const),
    closes_at: poll.closes_at?.toISOString() ?? null,
    options: options.rows,
    voted: options.rows.reduce((sum, option) => sum + option.votes, 0),
    eligible: poll.eligible,
    my_option_id: mine.rows[0]?.option_id ?? null,
    winner_option_id: poll.winner_option_id,
  };
}

async function loadCrew(tx: pg.PoolClient, tripId: string) {
  const meetup = await tx.query<{ id: string; place_name: string; meet_at: Date }>(
    `SELECT id, place_name, meet_at FROM meetups
      WHERE trip_id = $1 AND status = 'active' ORDER BY meet_at LIMIT 1`,
    [tripId],
  );
  const etas = await tx.query<{
    user_id: string;
    eta_min: number | null;
    progress: number | null;
    name: string | null;
  }>(
    `SELECT e.user_id, e.eta_min, e.progress, u.display_name AS name
       FROM member_etas e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.trip_id = $1 AND e.sharing <> 'off' ORDER BY e.user_id`,
    [tripId],
  );
  const at = meetup.rows[0];
  return {
    meetup:
      at === undefined ? null : { place_name: at.place_name, meet_at: at.meet_at.toISOString() },
    members: etas.rows.map((row) => ({
      user_id: row.user_id,
      bucket: etaBucket(row.eta_min, row.progress),
      initial: widgetInitial(row.name),
    })),
  };
}

async function loadNextFlight(tx: pg.PoolClient, uid: string) {
  const { rows } = await tx.query<{
    id: string;
    carrier: string;
    flight_no: string;
    dep_airport: string;
    arr_airport: string;
    departs_at: Date;
    boarding_at: Date | null;
    gate: string | null;
    terminal: string | null;
    status: string;
    delay_min: number | null;
  }>(
    `SELECT id, carrier, flight_no, dep_airport, arr_airport,
            coalesce(est_dep_at, sched_dep_at) AS departs_at, boarding_at, gate, terminal, status,
            delay_min
       FROM flight_segments
      WHERE owner_id = $1 AND act_arr_at IS NULL AND status NOT IN ('cancelled', 'landed')
        AND coalesce(est_dep_at, sched_dep_at) > now() - interval '6 hours'
      ORDER BY coalesce(est_dep_at, sched_dep_at) LIMIT 1`,
    [uid],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    ...row,
    dep_airport: row.dep_airport.trim(),
    arr_airport: row.arr_airport.trim(),
    departs_at: row.departs_at.toISOString(),
    boarding_at: row.boarding_at?.toISOString() ?? null,
  };
}

async function loadLeaveBy(tx: pg.PoolClient, uid: string, tripId: string) {
  const { rows } = await tx.query<{
    id: string;
    title: string;
    place_name: string | null;
    leave_at: Date;
    state: string;
  }>(
    `SELECT id, title, place_name, leave_at, state FROM leave_bys
      WHERE trip_id = $1 AND state NOT IN ('departed', 'cancelled')
        AND leave_at > now() - interval '30 minutes'
        AND (cardinality(participant_ids) = 0 OR $2 = ANY (participant_ids))
      ORDER BY leave_at LIMIT 1`,
    [tripId, uid],
  );
  const row = rows[0];
  return row === undefined ? null : { ...row, leave_at: row.leave_at.toISOString() };
}

/** The snapshot for `uid` (optionally pinned to `tripId`), as of `now`. */
export async function loadWidgetSnapshot(
  tx: pg.PoolClient,
  uid: string,
  tripId: string | undefined,
  now: Date,
): Promise<WidgetSnapshot> {
  const trip = await loadTrip(tx, uid, tripId);
  const perks = await tx.query<{ pass_plus: boolean | null; boost_active: boolean | null }>(
    `SELECT (SELECT pass_plus FROM user_entitlements WHERE user_id = $1) AS pass_plus,
            (SELECT boost_active FROM trip_entitlements WHERE trip_id = $2) AS boost_active`,
    [uid, trip?.id ?? null],
  );
  const passPlus = perks.rows[0]?.pass_plus === true;
  const boostActive = perks.rows[0]?.boost_active === true;
  const dex = await tx.query<{ found: number; total: number }>(
    `SELECT (SELECT count(DISTINCT critter_id)::int FROM collection_entries WHERE user_id = $1)
              AS found,
            (SELECT count(*)::int FROM critters) AS total`,
    [uid],
  );
  const countdown =
    trip === null
      ? null
      : ((
          await tx.query<{ countdown_target_at: Date | null }>(
            'SELECT countdown_target_at FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
            [trip.id, uid],
          )
        ).rows[0]?.countdown_target_at ?? null);
  return buildWidgetSnapshot({
    now,
    trip,
    countdownTargetAt: countdown,
    vote: trip === null ? null : await loadVote(tx, uid, trip.id),
    today: trip === null ? null : await loadToday(tx, uid, trip, now),
    balances: trip === null ? null : await loadBalance(tx, uid, trip.id, now),
    crew: trip !== null && boostActive ? await loadCrew(tx, trip.id) : null,
    critterdex: dex.rows[0] ?? { found: 0, total: 0 },
    nextFlight: passPlus ? await loadNextFlight(tx, uid) : null,
    nextLeaveBy: trip === null ? null : await loadLeaveBy(tx, uid, trip.id),
    passPlus,
    boostActive,
  });
}
