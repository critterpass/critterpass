/**
 * A crew in Bali on the day Rin lands (the guide-actions plan fixture, pinned to 2026-10-15 UTC):
 * Rin's SQ938 is due at 09:30; Made (a driver the crew added) picks Rin up at 10:00; Rin has a surf
 * lesson alone at 11:48 and the whole crew dines at 12:00. AeroAPI is replayed at its network
 * boundary with flight objects shaped as in the AeroAPI v4 reference.
 */
import { createAeroApiClient, createSupplierHttp, noSupplierCallAudit } from '@cp/suppliers';
import type pg from 'pg';

import { buildGuidePlan, type GuidePlanFixture } from '../guide-actions/plan-fixture';

export const NOW = new Date('2026-10-15T00:00:00Z');
const FA_ID = 'SIA938-1760490000-schedule-0001';

export interface FlightWorld extends GuidePlanFixture {
  readonly segmentId: string;
  readonly surfStableId: string;
  readonly madeId: string;
  /** Sets the flight AeroAPI answers with next: its arrival delay in minutes. */
  delay(minutes: number): void;
  readonly aero: ReturnType<typeof createAeroApiClient>;
  readonly alert: { alert_id: string; fa_flight_id: string };
}

function flight(delayMin: number): unknown {
  const arrival = new Date(Date.parse('2026-10-15T09:30:00Z') + delayMin * 60_000);
  return {
    fa_flight_id: FA_ID,
    ident: 'SIA938',
    ident_iata: 'SQ938',
    operator_iata: 'SQ',
    flight_number: '938',
    cancelled: false,
    diverted: false,
    scheduled_out: '2026-10-15T07:00:00Z',
    scheduled_in: '2026-10-15T09:30:00Z',
    estimated_out: new Date(Date.parse('2026-10-15T07:00:00Z') + delayMin * 60_000).toISOString(),
    estimated_in: arrival.toISOString(),
    departure_delay: delayMin * 60,
    origin: { code_iata: 'SIN' },
    destination: { code_iata: 'DPS' },
  };
}

export async function buildFlightWorld(pool: pg.Pool): Promise<FlightWorld> {
  const fx = await buildGuidePlan(pool, { inTrip: true, now: NOW });
  await pool.query("UPDATE trips SET tz = 'Asia/Makassar' WHERE id = $1", [fx.tripId]);
  const made = await pool.query<{ id: string }>(
    `INSERT INTO providers (trip_id, kind, name, added_by) VALUES ($1, 'driver', 'Made', $2) RETURNING id`,
    [fx.tripId, fx.organiserId],
  );
  const madeId = made.rows[0]?.id as string;
  await pool.query(
    `UPDATE plan_items SET provider_id = $3 WHERE version_id = $1 AND stable_id = $2`,
    [fx.versionId, fx.pickup.stableId, madeId],
  );
  const surf = await pool.query<{ stable_id: string }>(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, category,
       attendee_ids, notes, created_by_kind)
     SELECT version_id, day_id, trip_id, gen_random_uuid(), '2026-10-15T11:48:00Z',
            '2026-10-15T12:48:00Z', tz, 'activity', ARRAY[$3]::uuid[], 'Surf lesson', 'guide'
       FROM plan_items WHERE version_id = $1 AND stable_id = $2
     RETURNING stable_id`,
    [fx.versionId, fx.pickup.stableId, fx.rinId],
  );
  const booking = await pool.query<{ id: string }>(
    `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier, traveller_ids)
     VALUES ($1, $2, 'flight', 'SQ 938 · SIN → DPS', 'crew', 'airline', ARRAY[$2]::uuid[])
     RETURNING id`,
    [fx.tripId, fx.rinId],
  );
  const segment = await pool.query<{ id: string }>(
    `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
       dep_airport, arr_airport, sched_dep_at, sched_arr_at, boarding_at)
     VALUES ($1, $2, $3, true, 'SQ', '938', 'SIN', 'DPS', '2026-10-15T07:00:00Z',
       '2026-10-15T09:30:00Z', '2026-10-15T06:20:00Z') RETURNING id`,
    [booking.rows[0]?.id, fx.tripId, fx.rinId],
  );
  const segmentId = segment.rows[0]?.id as string;
  await pool.query(
    `INSERT INTO flight_watches (flight_segment_id, provider, provider_alert_id, active_until)
     VALUES ($1, 'flightaware', '5511', '2026-10-17T00:00:00Z')`,
    [segmentId],
  );
  let current = flight(0);
  const aero = createAeroApiClient(
    createSupplierHttp({
      audit: noSupplierCallAudit,
      fetch: () =>
        Promise.resolve(new Response(JSON.stringify({ flights: [current] }), { status: 200 })),
    }),
    { apiKey: 'replay' },
  );
  return {
    ...fx,
    segmentId,
    surfStableId: surf.rows[0]?.stable_id as string,
    madeId,
    aero,
    alert: { alert_id: '5511', fa_flight_id: FA_ID },
    delay(minutes: number) {
      current = flight(minutes);
    },
  };
}
