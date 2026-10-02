/**
 * The facts a flight disruption is worked out from, read in one system transaction: the segment
 * and its travellers, the trip's crew and zone, the current plan's items around the landing day
 * (with the vendor behind each and whether a booking or must-do locks it), the leave-bys on them
 * and the other members' own landings that day. A missed connection is read here too: the next
 * segment of the same booking leaving before the delayed one lands (with 45 minutes to connect).
 */
import type { FlightCause, FlightImpactInput, ImpactItem, ItemRole } from '@cp/planner';
import type pg from 'pg';

const CONNECT_MIN = 45;

interface SegmentRow {
  readonly id: string;
  readonly trip_id: string;
  readonly booking_id: string;
  readonly segment_no: number;
  readonly carrier: string;
  readonly flight_no: string;
  readonly arr_airport: string;
  readonly sched_arr_at: Date;
  readonly est_arr_at: Date | null;
  readonly status: string;
  readonly traveller_ids: string[];
  readonly tz: string;
  readonly crew_id: string;
  readonly trip_status: string;
  readonly guide_slug: string | null;
  readonly guide_id: string | null;
  readonly next_dep_at: Date | null;
}

export interface FlightFacts {
  readonly input: FlightImpactInput;
  readonly tripId: string;
  readonly crewId: string;
  readonly inTrip: boolean;
  /** The flight is down: whatever it disrupted is over. */
  readonly landed: boolean;
  readonly guide: string | null;
  readonly guideId: string | null;
  readonly organiserIds: readonly string[];
}

function causeOf(row: SegmentRow): FlightCause | null {
  if (row.status === 'landed') return 'delay';
  if (row.status === 'cancelled') return 'cancelled';
  if (row.status === 'diverted') return 'diverted';
  const lands = row.est_arr_at ?? row.sched_arr_at;
  if (row.next_dep_at !== null && +row.next_dep_at < +lands + CONNECT_MIN * 60_000) {
    return 'missed_connection';
  }
  return row.est_arr_at === null ? null : 'delay';
}

function roleOf(category: string | null, providerKind: string | null): ItemRole {
  if (category === 'transfer' || category === 'airport' || providerKind === 'driver') {
    return 'pickup';
  }
  if (category === 'stay' || providerKind === 'stay') return 'check_in';
  if (category === 'meal' || providerKind === 'restaurant') return 'meal';
  if (category === 'activity') return 'activity';
  return 'other';
}

export async function loadFlightFacts(
  tx: pg.PoolClient,
  segmentId: string,
): Promise<FlightFacts | null> {
  const { rows } = await tx.query<SegmentRow>(
    `SELECT s.id, s.trip_id, s.booking_id, s.segment_no, s.carrier, s.flight_no, s.arr_airport,
            s.sched_arr_at, s.est_arr_at, s.status, t.crew_id, t.status AS trip_status,
            coalesce(t.tz, d.tz, 'UTC') AS tz, g.slug AS guide_slug, t.guide_id,
            (SELECT array_agg(DISTINCT u ORDER BY u)
               FROM unnest(coalesce(b.traveller_ids, '{}'::uuid[]) || s.owner_id) AS u
              WHERE u IS NOT NULL) AS traveller_ids,
            (SELECT n.sched_dep_at FROM flight_segments n
              WHERE n.booking_id = s.booking_id AND n.segment_no = s.segment_no + 1) AS next_dep_at
       FROM flight_segments s
       JOIN bookings b ON b.id = s.booking_id
       JOIN trips t ON t.id = s.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN guides g ON g.id = t.guide_id
      WHERE s.id = $1`,
    [segmentId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const cause = causeOf(row);
  if (cause === null) return null;
  const crew = await tx.query<{ user_id: string; organiser: boolean }>(
    `SELECT p.user_id, (m.role = 'organiser') AS organiser
       FROM trip_participants p
       LEFT JOIN crew_members m ON m.crew_id = $2 AND m.user_id = p.user_id AND m.left_at IS NULL
      WHERE p.trip_id = $1 AND p.rsvp NOT IN ('out', 'waitlisted') ORDER BY p.user_id`,
    [row.trip_id, row.crew_id],
  );
  const crewIds = crew.rows.map((member) => member.user_id);
  const items = await tx.query<{
    id: string;
    stable_id: string;
    title: string;
    starts_at: Date;
    ends_at: Date | null;
    attendee_ids: string[] | null;
    category: string | null;
    provider_id: string | null;
    provider_name: string | null;
    provider_kind: string | null;
    booking_id: string | null;
    locked_reason: string | null;
  }>(
    `SELECT i.id, i.stable_id, left(coalesce(p.name, i.notes, initcap(i.category), 'Plan'), 60) AS title,
            i.starts_at, i.ends_at,
            CASE WHEN cardinality(i.attendee_ids) > 0 THEN i.attendee_ids END AS attendee_ids,
            i.category, pr.id AS provider_id, pr.name AS provider_name, pr.kind AS provider_kind,
            i.booking_id, i.locked_reason
       FROM plan_items i
       JOIN trips t ON t.current_version_id = i.version_id AND t.id = $1
       LEFT JOIN pois p ON p.id = i.poi_id
       LEFT JOIN providers pr ON pr.id = i.provider_id AND pr.deleted_at IS NULL
      WHERE i.starts_at BETWEEN $2::timestamptz - interval '2 hours'
                            AND $2::timestamptz + interval '24 hours'
      ORDER BY i.starts_at, i.id`,
    [row.trip_id, row.sched_arr_at],
  );
  const leaveBys = await tx.query<{ plan_item_stable_id: string; participant_ids: string[] }>(
    `SELECT plan_item_stable_id, participant_ids FROM leave_bys
      WHERE trip_id = $1 AND state <> 'cancelled'`,
    [row.trip_id],
  );
  const others = await tx.query<{ user_id: string; arrival: Date }>(
    `SELECT DISTINCT ON (s.owner_id) s.owner_id AS user_id, coalesce(s.est_arr_at, s.sched_arr_at) AS arrival
       FROM flight_segments s
      WHERE s.trip_id = $1 AND s.id <> $2 AND s.owner_id IS NOT NULL
        AND s.sched_arr_at BETWEEN $3::timestamptz - interval '12 hours'
                               AND $3::timestamptz + interval '24 hours'
      ORDER BY s.owner_id, s.sched_arr_at`,
    [row.trip_id, row.id, row.sched_arr_at],
  );
  const planItems: ImpactItem[] = items.rows.map((item) => ({
    id: item.id,
    stableId: item.stable_id,
    title: item.title,
    startsAt: item.starts_at,
    endsAt: item.ends_at,
    attendeeIds: item.attendee_ids,
    role: roleOf(item.category, item.provider_kind),
    providerId: item.provider_id,
    providerName: item.provider_name,
    bookingId: item.booking_id,
    locked: item.locked_reason !== null,
  }));
  return {
    tripId: row.trip_id,
    crewId: row.crew_id,
    inTrip: row.trip_status === 'in_trip',
    landed: row.status === 'landed',
    guide: row.guide_slug,
    guideId: row.guide_id,
    organiserIds: crew.rows.filter((member) => member.organiser).map((member) => member.user_id),
    input: {
      change: {
        segmentId: row.id,
        carrier: row.carrier,
        flightNo: row.flight_no,
        cause,
        scheduledArrival: row.sched_arr_at,
        newArrival: cause === 'cancelled' || cause === 'missed_connection' ? null : row.est_arr_at,
        arrivalAirport: row.arr_airport,
        travellerIds: row.traveller_ids,
        tz: row.tz,
      },
      crewIds,
      items: planItems,
      leaveBys: leaveBys.rows.map((leaveBy) => ({
        planItemStableId: leaveBy.plan_item_stable_id,
        participantIds: leaveBy.participant_ids,
      })),
      otherArrivals: others.rows
        .filter((other) => !row.traveller_ids.includes(other.user_id))
        .map((other) => ({ userId: other.user_id, arrival: other.arrival })),
    },
  };
}
