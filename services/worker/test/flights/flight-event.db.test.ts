/**
 * `flight.event` against a migrated Postgres, with AeroAPI replayed at its network boundary
 * (flight objects shaped as in the AeroAPI v4 reference). An alert sequence (delay → gate →
 * departed → landed) yields exactly one status change per step and exactly one `flight.landed`,
 * a repeated alert changes nothing, and a delivery nothing vouches for is ignored: an alert id no
 * watch knows, or a refetch that is another flight.
 */
import { createSupplierHttp, noSupplierCallAudit, createAeroApiClient } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleFlightEvent } from '../../src/jobs/flights/flight-event';
import { startSetupWorld, type SetupWorld } from '../setup/setup-fixture';

const FA_ID = 'SIA938-1760000000-schedule-0001';
const BASE = {
  fa_flight_id: FA_ID,
  ident: 'SIA938',
  ident_iata: 'SQ938',
  operator_iata: 'SQ',
  flight_number: '938',
  cancelled: false,
  diverted: false,
  scheduled_out: '2026-10-12T01:40:00Z',
  scheduled_in: '2026-10-12T04:10:00Z',
  origin: { code_iata: 'SIN' },
  destination: { code_iata: 'DPS' },
};
const STEPS = [
  { ...BASE, departure_delay: 2700, estimated_out: '2026-10-12T02:25:00Z', gate_origin: null },
  { ...BASE, departure_delay: 2700, estimated_out: '2026-10-12T02:25:00Z', gate_origin: 'B4' },
  { ...BASE, departure_delay: 2820, gate_origin: 'B4', actual_out: '2026-10-12T02:27:00Z' },
  {
    ...BASE,
    departure_delay: 2820,
    gate_origin: 'B4',
    actual_out: '2026-10-12T02:27:00Z',
    actual_in: '2026-10-12T04:58:00Z',
  },
];

let world: SetupWorld;
let segmentId: string;
let current: unknown = STEPS[0];
const aero = createAeroApiClient(
  createSupplierHttp({
    audit: noSupplierCallAudit,
    fetch: () =>
      Promise.resolve(new Response(JSON.stringify({ flights: [current] }), { status: 200 })),
  }),
  { apiKey: 'replay' },
);

async function events(type: string): Promise<{ change: string }[]> {
  return world.q<{ change: string }>(
    `SELECT payload->>'change' AS change FROM domain_events WHERE type = $1 AND aggregate_id = $2 ORDER BY occurred_at, id`,
    [type, segmentId],
  );
}

beforeAll(async () => {
  world = await startSetupWorld(2);
  const [owner] = world.members as [string];
  const [booking] = await world.q<{ id: string }>(
    `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier, traveller_ids)
     VALUES ($1, $2, 'flight', 'SQ 938 · SIN → DPS', 'personal', 'airline', ARRAY[$2]::uuid[]) RETURNING id`,
    [world.tripId, owner],
  );
  const [segment] = await world.q<{ id: string }>(
    `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
       dep_airport, arr_airport, sched_dep_at, sched_arr_at, boarding_at)
     VALUES ($1, $2, $3, true, 'SQ', '938', 'SIN', 'DPS', '2026-10-12T01:40:00Z', '2026-10-12T04:10:00Z',
       '2026-10-12T01:00:00Z') RETURNING id`,
    [booking?.id, world.tripId, owner],
  );
  segmentId = segment?.id as string;
  await world.q(
    `INSERT INTO flight_watches (flight_segment_id, provider, provider_alert_id, active_until)
     VALUES ($1, 'flightaware', '4411', '2026-10-14T00:00:00Z')`,
    [segmentId],
  );
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('flight.event', () => {
  it('turns the alert sequence into one change per step and one landing', async () => {
    const now = new Date('2026-10-12T00:00:00Z');
    for (const [index, step] of STEPS.entries()) {
      current = step;
      const result = await handleFlightEvent(
        world.harness.pool,
        aero,
        { alert_id: '4411', fa_flight_id: FA_ID, event_code: `e${index}` },
        now,
      );
      expect(result.outcome).toBe('applied');
    }
    const again = await handleFlightEvent(
      world.harness.pool,
      aero,
      { alert_id: '4411', fa_flight_id: FA_ID, event_code: 'in' },
      now,
    );
    expect(again).toEqual({ outcome: 'applied', changes: 0 });
    expect((await events('flight.status_changed')).map((row) => row.change)).toEqual([
      'delay',
      'gate',
      'departed',
      'landed',
    ]);
    expect(await events('flight.landed')).toHaveLength(1);
    const [segment] = await world.q<{
      status: string;
      gate: string;
      status_source: string;
      boarding_at: Date;
    }>('SELECT status, gate, status_source, boarding_at FROM flight_segments WHERE id = $1', [
      segmentId,
    ]);
    expect(segment).toMatchObject({ status: 'landed', gate: 'B4', status_source: 'flightaware' });
    expect(segment?.boarding_at).toEqual(new Date('2026-10-12T01:45:00Z'));
  });

  it('ignores an alert no watch knows, and a refetch that is another flight', async () => {
    const before = (await events('flight.status_changed')).length;
    expect(
      await handleFlightEvent(
        world.harness.pool,
        aero,
        { alert_id: '9999', fa_flight_id: FA_ID, event_code: 'x' },
        new Date(),
      ),
    ).toEqual({ outcome: 'ignored', changes: 0 });
    current = {
      ...STEPS[0],
      fa_flight_id: 'X',
      ident_iata: 'SQ940',
      flight_number: '940',
      cancelled: true,
    };
    expect(
      await handleFlightEvent(
        world.harness.pool,
        aero,
        { alert_id: '4411', fa_flight_id: 'X', event_code: 'cancelled' },
        new Date(),
      ),
    ).toEqual({ outcome: 'ignored', changes: 0 });
    expect((await events('flight.status_changed')).length).toBe(before);
  });
});
