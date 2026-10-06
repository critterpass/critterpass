/**
 * A first draft gives the destination's essential day trips a day, or says why not. Only a first
 * draft of a trip with one stop, with `trip.areas` on and no day the organiser already sent
 * elsewhere, is offered any; the candidates are the destination's `day_trip` links marked
 * essential, in their order.
 *
 * A full-day trip needs a trip of four days or more, a half-day trip three. A day trip never takes
 * the first or the last day, and a trip holds at most one for every three of its days. Its day is
 * the middle day nearest the trip's midpoint (the later one on a tie) that holds none of the
 * crew's own stops or bookings.
 */
import type { DayTripGapReason } from '@cp/domain';
import type pg from 'pg';

export interface DayTripCandidate {
  readonly destinationId: string;
  readonly name: string;
  readonly minutes: number;
  readonly dayLength: 'half' | 'full';
  /** The area has recommended places to plan the day from. */
  readonly hasPlaces: boolean;
}

export interface PlacedDayTrip {
  readonly destinationId: string;
  readonly name: string;
  readonly minutes: number;
  readonly dayNo: number;
}

export interface DayTripChoice {
  readonly placed: readonly PlacedDayTrip[];
  readonly leftOut: readonly {
    readonly destinationId: string;
    readonly reason: DayTripGapReason;
  }[];
}

const MIN_DAYS = { half: 3, full: 4 } as const;
/** One day trip for every this many days of the trip. */
const DAYS_PER_DAY_TRIP = 3;

/** The middle days of a trip, nearest its midpoint first (the later one first on a tie). */
function middleDays(days: number): number[] {
  const mid = (days + 1) / 2;
  return Array.from({ length: Math.max(0, days - 2) }, (_, i) => i + 2).sort(
    (a, b) => Math.abs(a - mid) - Math.abs(b - mid) || b - a,
  );
}

export function chooseDayTrips(
  days: number,
  candidates: readonly DayTripCandidate[],
  /** Days holding the crew's own stops or bookings. */
  busy: ReadonlySet<number>,
): DayTripChoice {
  const placed: PlacedDayTrip[] = [];
  const leftOut: DayTripChoice['leftOut'][number][] = [];
  const room = Math.floor(days / DAYS_PER_DAY_TRIP);
  const leave = (candidate: DayTripCandidate, reason: DayTripGapReason) =>
    leftOut.push({ destinationId: candidate.destinationId, reason });
  for (const candidate of candidates) {
    if (days < MIN_DAYS[candidate.dayLength]) {
      leave(candidate, 'trip_too_short');
      continue;
    }
    if (!candidate.hasPlaces) {
      leave(candidate, 'no_places');
      continue;
    }
    if (placed.length >= room) {
      leave(candidate, 'no_room');
      continue;
    }
    const taken = new Set(placed.map((trip) => trip.dayNo));
    const dayNo = middleDays(days).find((day) => !busy.has(day) && !taken.has(day));
    if (dayNo === undefined) {
      leave(candidate, 'no_free_day');
      continue;
    }
    placed.push({
      destinationId: candidate.destinationId,
      name: candidate.name,
      minutes: candidate.minutes,
      dayNo,
    });
  }
  return { placed, leftOut };
}

/** The destination's essential day trips, in their order, with whether each area has places. */
export async function essentialDayTrips(
  tx: pg.PoolClient,
  destinationId: string,
): Promise<DayTripCandidate[]> {
  const { rows } = await tx.query<{
    to_destination_id: string;
    name: string;
    minutes: number;
    day_length: 'half' | 'full';
    has_places: boolean;
  }>(
    `SELECT l.to_destination_id, d.name, l.minutes, l.day_length,
            EXISTS (SELECT 1 FROM pois p
                     WHERE p.destination_id = l.to_destination_id AND p.status = 'active'
                       AND p.merged_into_id IS NULL
                       AND p.category NOT IN ('transit', 'stay', 'health')) AS has_places
       FROM destination_links l JOIN destinations d ON d.id = l.to_destination_id
      WHERE l.from_destination_id = $1 AND l.kind = 'day_trip' AND l.essential IS TRUE
      ORDER BY l.position, l.key`,
    [destinationId],
  );
  return rows.map((row) => ({
    destinationId: row.to_destination_id,
    name: row.name,
    minutes: row.minutes,
    dayLength: row.day_length,
    hasPlaces: row.has_places,
  }));
}

/** The coverage key a first draft writes; none when the destination offered no day trip. */
export function dayTripsCoverage(choice: DayTripChoice | null) {
  if (choice === null || choice.placed.length + choice.leftOut.length === 0) return {};
  return {
    day_trips: {
      placed: choice.placed.map((trip) => ({
        destination_id: trip.destinationId,
        day_no: trip.dayNo,
      })),
      left_out: choice.leftOut.map((gap) => ({
        destination_id: gap.destinationId,
        reason: gap.reason,
      })),
    },
  };
}
