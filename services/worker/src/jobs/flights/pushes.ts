/**
 * Flight pushes to the travellers on the booking (its owner and named travellers): a delay, a gate
 * change, a cancellation or a diversion (N-14, ALWAYS) and boarding (N-41, ALWAYS). Bodies carry the
 * flight, the route and the new time or gate; the source and time stay on the card.
 */
import { boardingPassLink, BOOKING_PUSH, bookingLink } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';

interface FlightFacts {
  readonly owner_id: string;
  readonly traveller_ids: string[];
  readonly carrier: string;
  readonly flight_no: string;
  readonly dep_airport: string;
  readonly arr_airport: string;
  readonly gate: string | null;
  readonly delay_min: number | null;
  readonly est_dep_at: Date | null;
  readonly sched_dep_at: Date;
  readonly tz: string | null;
}

async function facts(tx: pg.PoolClient, routed: RoutedEvent): Promise<FlightFacts | undefined> {
  const { rows } = await tx.query<FlightFacts>(
    `SELECT b.owner_id, b.traveller_ids, s.carrier, s.flight_no, s.dep_airport, s.arr_airport, s.gate,
            s.delay_min, s.est_dep_at, s.sched_dep_at, b.tz
       FROM flight_segments s JOIN bookings b ON b.id = s.booking_id
      WHERE s.id = $1 AND b.deleted_at IS NULL`,
    [str(routed, 'segment_id')],
  );
  return rows[0];
}

async function travellers(tx: pg.PoolClient, routed: RoutedEvent): Promise<string[]> {
  const row = await facts(tx, routed);
  return row === undefined ? [] : [...new Set([row.owner_id, ...row.traveller_ids])];
}

const clock = (at: Date, tz: string | null) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz ?? 'UTC',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);

export function registerFlightPushes(): void {
  registerNotification({
    key: 'flight_changed',
    event: 'flight.status_changed',
    audience: async (tx, routed) => {
      const change = str(routed, 'change');
      return change === 'delay' ||
        change === 'gate' ||
        change === 'cancelled' ||
        change === 'diverted'
        ? travellers(tx, routed)
        : [];
    },
    async compose(tx, routed) {
      const row = await facts(tx, routed);
      if (row === undefined) return null;
      const change = str(routed, 'change');
      const body =
        change === 'delay'
          ? BOOKING_PUSH.delayed
          : change === 'gate'
            ? BOOKING_PUSH.gate
            : change === 'cancelled'
              ? BOOKING_PUSH.cancelled
              : BOOKING_PUSH.diverted;
      return {
        title: BOOKING_PUSH.flightTitle,
        body,
        vars: {
          flight: `${row.carrier} ${row.flight_no}`,
          route: `${row.dep_airport} → ${row.arr_airport}`,
          minutes: String(row.delay_min ?? 0),
          time: clock(row.est_dep_at ?? row.sched_dep_at, row.tz),
          gate: row.gate ?? '',
        },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: routed.crewId,
        tripId: routed.tripId,
        deepLink: bookingLink(str(routed, 'booking_id') ?? ''),
        collapseVars: { flight_id: str(routed, 'segment_id') ?? '' },
      };
    },
  });
  registerNotification({
    key: 'boarding_open',
    event: 'flight.boarding_open',
    audience: travellers,
    async compose(tx, routed) {
      const row = await facts(tx, routed);
      if (row === undefined) return null;
      const estimated = routed.payload['estimated'] === true || row.gate === null;
      return {
        title: BOOKING_PUSH.boardingTitle,
        body: estimated ? BOOKING_PUSH.boardingEstimated : BOOKING_PUSH.boardingBody,
        vars: { flight: `${row.carrier} ${row.flight_no}`, gate: row.gate ?? '' },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: routed.crewId,
        tripId: routed.tripId,
        deepLink: boardingPassLink(str(routed, 'booking_id') ?? ''),
        collapseVars: { flight_id: str(routed, 'segment_id') ?? '' },
      };
    },
  });
}
