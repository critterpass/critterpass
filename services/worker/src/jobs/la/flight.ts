/**
 * The flight-day loader: any flight leg in the wallet (forwarded, scanned, pasted, typed in or
 * imported from the mailbox) shows on its travellers' lock screens from three hours before
 * departure, follows gate and delay changes, and after landing becomes the pickup card: the
 * transfer booked for the arrival (operator and meeting point as printed), or the Grab hand-off.
 * It ends two hours after landing; a cancelled flight shows its red frame for an hour, then goes.
 */
import {
  buildFlightLaAttributes,
  buildFlightLaState,
  flightLaEndsAt,
  flightLaPhase,
  LA_COPY,
  LA_PICKUP_MS,
  type BookingSource,
  type FlightLaInput,
  type FlightStatus,
} from '@cp/domain';

import { clockIn, ROUTINE, type LaLoader } from './snapshot';

interface SegmentRow {
  id: string;
  booking_id: string;
  trip_id: string;
  owner_id: string;
  traveller_ids: string[];
  source: BookingSource;
  seat: string | null;
  tz: string | null;
  carrier: string;
  flight_no: string;
  dep_airport: string;
  arr_airport: string;
  status: FlightStatus;
  sched_dep_at: Date;
  est_dep_at: Date | null;
  act_dep_at: Date | null;
  sched_arr_at: Date | null;
  est_arr_at: Date | null;
  act_arr_at: Date | null;
  boarding_at: Date | null;
  gate: string | null;
  terminal: string | null;
  delay_min: number | null;
}

const CANCELLED_LINGER_MS = 60 * 60_000;
/** A leg with no departure report reads departed this long after its departure time. */
const DEPARTED_BY_SCHEDULE_MS = 15 * 60_000;
/** A leg with no landing time at all is taken to land this long after departure. */
const NO_ARRIVAL_TIME_MS = 12 * 3_600_000;
const LANDED_LINGER_MS = 15 * 60_000;

export const flightLoader: LaLoader = async ({ tx, refId, now }) => {
  const { rows } = await tx.query<SegmentRow>(
    `SELECT s.id, s.booking_id, s.trip_id, s.owner_id, b.traveller_ids, b.source,
            b.details ->> 'seat' AS seat, coalesce(b.tz, t.tz) AS tz, s.carrier, s.flight_no, s.dep_airport,
            s.arr_airport, s.status, s.sched_dep_at, s.est_dep_at, s.act_dep_at, s.sched_arr_at,
            s.est_arr_at, s.act_arr_at, s.boarding_at, s.gate, s.terminal, s.delay_min
       FROM flight_segments s JOIN bookings b ON b.id = s.booking_id JOIN trips t ON t.id = s.trip_id
      WHERE s.id = $1 AND b.deleted_at IS NULL`,
    [refId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const arrives = row.act_arr_at ?? row.est_arr_at ?? row.sched_arr_at;
  const transfer =
    arrives === null
      ? []
      : (
          await tx.query<{ name: string; line: string }>(
            `SELECT coalesce(nullif(details ->> 'operator', ''), title) AS name,
                    coalesce(details ->> 'meeting_point', '') AS line
               FROM bookings
              WHERE trip_id = $1 AND type = 'transfer' AND status = 'booked' AND deleted_at IS NULL
                AND starts_at BETWEEN $2::timestamptz - interval '1 hour'
                                  AND $2::timestamptz + interval '4 hours'
              ORDER BY starts_at LIMIT 1`,
            [row.trip_id, arrives],
          )
        ).rows;
  const input: FlightLaInput = {
    bookingId: row.booking_id,
    segmentId: row.id,
    carrier: row.carrier,
    flightNo: row.flight_no,
    depAirport: row.dep_airport,
    arrAirport: row.arr_airport,
    source: row.source,
    status: row.status,
    schedDepAt: row.sched_dep_at,
    estDepAt: row.est_dep_at,
    actDepAt: row.act_dep_at,
    schedArrAt: row.sched_arr_at,
    estArrAt: row.est_arr_at,
    actArrAt: row.act_arr_at,
    boardingAt: row.boarding_at,
    gate: row.gate,
    terminal: row.terminal,
    seat: row.seat,
    delayMin: row.delay_min,
    pickup: transfer[0] ?? null,
  };
  const departs = row.est_dep_at ?? row.sched_dep_at;
  // The schedule bounds the activity whatever the status feed says (or never says): a leg nobody
  // reported as departed reads departed a quarter of an hour after its departure time, and the
  // activity is over two hours after its landing time (fourteen hours after departure when no
  // landing time is known). Without this a leg with no live status would board for ever.
  const endsAt =
    flightLaEndsAt(input) ?? new Date(departs.getTime() + NO_ARRIVAL_TIME_MS + LA_PICKUP_MS);
  const reported = flightLaPhase(input, now);
  const phase =
    (reported === 'check_in' || reported === 'boarding') &&
    now.getTime() >= departs.getTime() + DEPARTED_BY_SCHEDULE_MS
      ? 'departed'
      : reported;
  return {
    tripId: row.trip_id,
    live: phase !== null && phase !== 'cancelled' && now.getTime() < endsAt.getTime(),
    audience: row.traveller_ids.length > 0 ? row.traveller_ids : [row.owner_id],
    attributes: () => Promise.resolve(buildFlightLaAttributes(input)),
    state: (seq) => buildFlightLaState(input, phase ?? 'pickup', now, seq),
    startAlert: {
      title: LA_COPY.flightStartTitle,
      body: LA_COPY.flightStartBody,
      vars: {
        flight: `${row.carrier} ${row.flight_no}`,
        route: `${row.dep_airport} → ${row.arr_airport}`,
        time: clockIn(departs, row.tz ?? 'UTC'),
      },
    },
    endsAt,
    lingerMs: phase === 'cancelled' ? CANCELLED_LINGER_MS : LANDED_LINGER_MS,
    urgency: () => ROUTINE,
  };
};
