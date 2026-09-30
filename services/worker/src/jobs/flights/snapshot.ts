/**
 * What the lock screen and the widgets read about flights. `syncLaPhase` keeps a leg's
 * `la_phase` current whenever the flight jobs touch it (a provider reading, a schedule check, the
 * boarding ping) and sends `boarding.soon` once, when the leg enters its Live Activity window
 * three hours out. `nextFlightSnapshot` is the NEXT FLIGHT block of the widget snapshot
 * (`snapshot/widgets.json`): the member's next leg that has not landed, with its gate and boarding
 * time as last stored, so a gate change reaches the widget on the next snapshot read.
 */
import { appendDomainEvent } from '@cp/db';
import {
  boardingSoonPayloadSchema,
  laPhase,
  nextFlightSnapshotSchema,
  type FlightStatus,
  type LaPhase,
  type NextFlightSnapshot,
} from '@cp/domain';
import type pg from 'pg';

interface PhaseRow {
  readonly id: string;
  readonly booking_id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly owner_id: string;
  readonly traveller_ids: string[];
  readonly status: FlightStatus;
  readonly sched_dep_at: Date;
  readonly est_dep_at: Date | null;
  readonly act_dep_at: Date | null;
  readonly sched_arr_at: Date | null;
  readonly est_arr_at: Date | null;
  readonly act_arr_at: Date | null;
  readonly boarding_at: Date | null;
  readonly boarding_estimated: boolean;
  readonly la_phase: LaPhase | null;
}

/** Recomputes a leg's phase; answers the phase stored (null outside the window). */
export async function syncLaPhase(
  tx: pg.PoolClient,
  segmentId: string,
  now: Date,
): Promise<LaPhase | null> {
  const { rows } = await tx.query<PhaseRow>(
    `SELECT s.id, s.booking_id, s.trip_id, t.crew_id, s.owner_id, b.traveller_ids, s.status,
            s.sched_dep_at, s.est_dep_at, s.act_dep_at, s.sched_arr_at, s.est_arr_at, s.act_arr_at,
            s.boarding_at, s.boarding_estimated, s.la_phase
       FROM flight_segments s JOIN bookings b ON b.id = s.booking_id JOIN trips t ON t.id = s.trip_id
      WHERE s.id = $1 AND b.deleted_at IS NULL`,
    [segmentId],
  );
  const leg = rows[0];
  if (leg === undefined) return null;
  const phase = laPhase(
    {
      status: leg.status,
      schedDepAt: leg.sched_dep_at,
      estDepAt: leg.est_dep_at,
      actDepAt: leg.act_dep_at,
      actArrAt: leg.act_arr_at,
      estArrAt: leg.est_arr_at,
      schedArrAt: leg.sched_arr_at,
      boardingAt: leg.boarding_at,
    },
    now,
  );
  if (phase === leg.la_phase) return phase;
  await tx.query('UPDATE flight_segments SET la_phase = $2 WHERE id = $1', [leg.id, phase]);
  if (leg.la_phase === null && phase === 'check_in') {
    const payload = boardingSoonPayloadSchema.parse({
      trip_id: leg.trip_id,
      booking_id: leg.booking_id,
      segment_id: leg.id,
      user_ids: [...new Set([leg.owner_id, ...leg.traveller_ids])],
      departs_at: (leg.est_dep_at ?? leg.sched_dep_at).toISOString(),
      boarding_at: leg.boarding_at?.toISOString() ?? null,
      boarding_estimated: leg.boarding_estimated,
    });
    await appendDomainEvent(tx, {
      type: 'boarding.soon',
      aggregateKind: 'flight_segment',
      aggregateId: leg.id,
      actorKind: 'system',
      actorId: null,
      crewId: leg.crew_id,
      tripId: leg.trip_id,
      payload,
    });
  }
  return phase;
}

interface NextRow {
  readonly booking_id: string;
  readonly segment_id: string;
  readonly carrier: string;
  readonly flight_no: string;
  readonly dep_airport: string;
  readonly arr_airport: string;
  readonly sched_dep_at: Date;
  readonly est_dep_at: Date | null;
  readonly sched_arr_at: Date | null;
  readonly est_arr_at: Date | null;
  readonly status: string;
  readonly delay_min: number | null;
  readonly gate: string | null;
  readonly terminal: string | null;
  readonly la_phase: string | null;
  readonly boarding_at: Date | null;
  readonly boarding_estimated: boolean;
}

/** The member's next leg (their own, or one they travel on) that has not landed or been cancelled. */
export async function nextFlightSnapshot(
  tx: pg.PoolClient,
  userId: string,
  now: Date,
): Promise<NextFlightSnapshot> {
  const { rows } = await tx.query<NextRow>(
    `SELECT s.booking_id, s.id AS segment_id, s.carrier, s.flight_no, s.dep_airport, s.arr_airport,
            s.sched_dep_at, s.est_dep_at, s.sched_arr_at, s.est_arr_at, s.status, s.delay_min, s.gate,
            s.terminal, s.la_phase, s.boarding_at, s.boarding_estimated
       FROM flight_segments s JOIN bookings b ON b.id = s.booking_id
      WHERE b.deleted_at IS NULL AND b.status <> 'cancelled'
        AND (s.owner_id = $1 OR $1 = ANY (b.traveller_ids))
        AND s.status NOT IN ('landed', 'cancelled')
        AND coalesce(s.est_arr_at, s.sched_arr_at, s.est_dep_at, s.sched_dep_at) > $2::timestamptz - interval '6 hours'
      ORDER BY coalesce(s.est_dep_at, s.sched_dep_at), s.segment_no
      LIMIT 1`,
    [userId, now],
  );
  const leg = rows[0];
  if (leg === undefined) {
    return nextFlightSnapshotSchema.parse({
      next_flight: null,
      boarding_at: null,
      boarding_estimated: false,
    });
  }
  return nextFlightSnapshotSchema.parse({
    next_flight: {
      booking_id: leg.booking_id,
      segment_id: leg.segment_id,
      flight: `${leg.carrier} ${leg.flight_no}`,
      from: leg.dep_airport,
      to: leg.arr_airport,
      departs_at: (leg.est_dep_at ?? leg.sched_dep_at).toISOString(),
      arrives_at: (leg.est_arr_at ?? leg.sched_arr_at)?.toISOString() ?? null,
      status: leg.status,
      delay_min: leg.delay_min,
      gate: leg.gate,
      terminal: leg.terminal,
      la_phase: leg.la_phase,
    },
    boarding_at: leg.boarding_at?.toISOString() ?? null,
    boarding_estimated: leg.boarding_estimated,
  });
}
