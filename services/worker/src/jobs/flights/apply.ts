/**
 * Applying a provider's reading to a stored flight segment, in one transaction: the diff decides
 * what changed (each change once), the segment takes the new times, gate and status, the boarding
 * ping moves with the departure, and the events go out: `flight.status_changed` per change (delay,
 * gate, cancel and divert push the traveller, N-14; delay is also what the disruption planner
 * reads), `flight.landed` exactly once, and a `flight.status` hint for the cards; the leg's Live
 * Activity phase follows. A landed flight's watch ends a day later.
 */
import { appendDomainEvent, cancelScheduledEvent, outbox, scheduleEvent } from '@cp/db';
import {
  BOOKINGS_QUEUES,
  BOOKINGS_RT,
  boardingTime,
  channelName,
  diffFlight,
  type FlightChange,
  type FlightStatus,
} from '@cp/domain';
import type { FlightSnapshot } from '@cp/suppliers';
import type pg from 'pg';

import { syncLaPhase } from './snapshot';

interface SegmentRow {
  readonly id: string;
  readonly booking_id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly owner_id: string;
  readonly traveller_ids: string[];
  readonly crew_visible: boolean;
  readonly carrier: string;
  readonly flight_no: string;
  readonly status: FlightStatus;
  readonly gate: string | null;
  readonly delay_min: number | null;
  readonly sched_dep_at: Date;
  readonly est_dep_at: Date | null;
  readonly boarding_estimated: boolean;
  readonly boarding_at: Date | null;
}

export async function lockSegment(
  tx: pg.PoolClient,
  segmentId: string,
): Promise<SegmentRow | undefined> {
  const { rows } = await tx.query<SegmentRow>(
    `SELECT s.id, s.booking_id, s.trip_id, t.crew_id, s.owner_id, b.traveller_ids, s.crew_visible,
            s.carrier, s.flight_no,
            s.status, s.gate, s.delay_min, s.sched_dep_at, s.est_dep_at, s.boarding_estimated, s.boarding_at
       FROM flight_segments s JOIN bookings b ON b.id = s.booking_id JOIN trips t ON t.id = s.trip_id
      WHERE s.id = $1 AND b.deleted_at IS NULL FOR UPDATE OF s`,
    [segmentId],
  );
  return rows[0];
}

/** Whether a reading is about this segment's flight (same number, departing within 12 hours). */
export function readingMatches(
  stored: { readonly carrier: string; readonly flight_no: string; readonly sched_dep_at: Date },
  reading: FlightSnapshot,
): boolean {
  if (reading.carrier !== stored.carrier || reading.flightNo !== stored.flight_no) return false;
  if (reading.schedDepAt === null) return true;
  return Math.abs(Date.parse(reading.schedDepAt) - stored.sched_dep_at.getTime()) <= 12 * 3_600_000;
}

export async function applyReading(
  tx: pg.PoolClient,
  segmentId: string,
  reading: FlightSnapshot,
  now: Date,
): Promise<readonly FlightChange[]> {
  const segment = await lockSegment(tx, segmentId);
  if (segment === undefined) return [];
  const diff = diffFlight(
    { status: segment.status, gate: segment.gate, delayMin: segment.delay_min },
    reading,
  );
  const underway = ['departed', 'landed', 'diverted', 'cancelled'].includes(diff.status);
  const boarding =
    !underway && (segment.boarding_estimated || reading.boardingAt !== null)
      ? boardingTime({
          schedDepAt: segment.sched_dep_at,
          estDepAt: reading.estDepAt === null ? segment.est_dep_at : new Date(reading.estDepAt),
          announcedAt: reading.boardingAt === null ? null : new Date(reading.boardingAt),
        })
      : { at: segment.boarding_at ?? segment.sched_dep_at, estimated: segment.boarding_estimated };
  await tx.query(
    `UPDATE flight_segments SET status = $2, gate = coalesce($3, gate), terminal = coalesce($4, terminal),
       delay_min = $5, est_dep_at = coalesce($6, est_dep_at), est_arr_at = coalesce($7, est_arr_at),
       act_dep_at = coalesce($8, act_dep_at), act_arr_at = coalesce($9, act_arr_at),
       boarding_at = $10, boarding_estimated = $11, status_source = $12, status_at = $13,
       version = version + CASE WHEN $14 THEN 1 ELSE 0 END
     WHERE id = $1`,
    [
      segment.id,
      diff.status,
      reading.gate,
      reading.terminal,
      reading.delayMin ?? segment.delay_min,
      reading.estDepAt,
      reading.estArrAt,
      reading.actDepAt,
      reading.actArrAt,
      boarding.at,
      boarding.estimated,
      reading.provider,
      now,
      diff.changes.length > 0,
    ],
  );
  const boardingKey = { kind: BOOKINGS_QUEUES.boardingSchedule, refId: segment.id };
  if (['cancelled', 'diverted', 'departed', 'landed'].includes(diff.status)) {
    await cancelScheduledEvent(tx, boardingKey);
  } else if (boarding.at.getTime() > now.getTime()) {
    await scheduleEvent(tx, { ...boardingKey, tz: 'UTC', at: boarding.at });
  }
  const ids = { trip_id: segment.trip_id, booking_id: segment.booking_id, segment_id: segment.id };
  const base = {
    aggregateKind: 'flight_segment',
    aggregateId: segment.id,
    actorKind: 'system' as const,
    actorId: null,
    crewId: segment.crew_id,
    tripId: segment.trip_id,
  };
  for (const change of diff.changes) {
    await appendDomainEvent(tx, {
      ...base,
      type: 'flight.status_changed',
      payload: { ...ids, change, status: diff.status },
    });
  }
  if (diff.changes.includes('landed')) {
    await appendDomainEvent(tx, {
      ...base,
      type: 'flight.landed',
      payload: {
        ...ids,
        user_ids: [...new Set([segment.owner_id, ...segment.traveller_ids])],
        source: 'provider',
      },
    });
    await tx.query(
      `UPDATE flight_watches SET active_until = least(active_until, $2::timestamptz + interval '1 day')
        WHERE flight_segment_id = $1 AND ended_at IS NULL`,
      [segment.id, now],
    );
  }
  if (diff.changes.length > 0) {
    await outbox(
      tx,
      segment.crew_visible
        ? channelName('crew_bookings', segment.crew_id)
        : channelName('user', segment.owner_id),
      BOOKINGS_RT.flightStatus,
      { segment_id: segment.id, booking_id: segment.booking_id, status: diff.status },
    );
  }
  await syncLaPhase(tx, segment.id, now);
  return diff.changes;
}
