/**
 * The Live Activity phase, `boarding.soon` and the NEXT FLIGHT snapshot against a migrated
 * Postgres. The T−3 h schedule check opens the window even with no provider configured and sends
 * `boarding.soon` once; a provider reading that moves the gate reaches the snapshot on the next
 * read; a landing sends one `flight.landed`, and both payloads validate against their schemas.
 */
import { withSystem } from '@cp/db';
import {
  boardingSoonPayloadSchema,
  flightLandedPayloadSchema,
  nextFlightSnapshotSchema,
} from '@cp/domain';
import type { FlightSnapshot } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyReading } from '../../src/jobs/flights/apply';
import { pollFlight } from '../../src/jobs/flights/flight-poll';
import { nextFlightSnapshot } from '../../src/jobs/flights/snapshot';
import { startSetupWorld, type SetupWorld } from '../setup/setup-fixture';

const DEP = '2026-10-12T01:40:00Z';

const READING: FlightSnapshot = {
  provider: 'flightaware',
  providerFlightId: 'SIA938-1',
  carrier: 'SQ',
  flightNo: '938',
  depAirport: 'SIN',
  arrAirport: 'DPS',
  schedDepAt: DEP,
  schedArrAt: '2026-10-12T04:10:00Z',
  estDepAt: null,
  estArrAt: null,
  actDepAt: null,
  actArrAt: null,
  gate: 'B7',
  terminal: '3',
  status: 'on_time',
  delayMin: 0,
  boardingAt: null,
};

let world: SetupWorld;
let owner: string;
let segmentId: string;

async function payloads(type: string): Promise<unknown[]> {
  const rows = await world.q<{ payload: unknown }>(
    'SELECT payload FROM domain_events WHERE type = $1 AND aggregate_id = $2 ORDER BY occurred_at, id',
    [type, segmentId],
  );
  return rows.map((row) => row.payload);
}

function snapshot(at: string) {
  return withSystem(world.harness.pool, (tx) => nextFlightSnapshot(tx, owner, new Date(at)));
}

beforeAll(async () => {
  world = await startSetupWorld(2);
  owner = world.members[0] as string;
  const [booking] = await world.q<{ id: string }>(
    `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier, traveller_ids)
     VALUES ($1, $2, 'flight', 'SQ 938 · SIN → DPS', 'personal', 'airline', ARRAY[$2]::uuid[]) RETURNING id`,
    [world.tripId, owner],
  );
  const [segment] = await world.q<{ id: string }>(
    `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
       dep_airport, arr_airport, sched_dep_at, sched_arr_at, boarding_at, boarding_estimated, gate)
     VALUES ($1, $2, $3, true, 'SQ', '938', 'SIN', 'DPS', $4, '2026-10-12T04:10:00Z',
       '2026-10-12T01:00:00Z', true, 'B7') RETURNING id`,
    [booking?.id, world.tripId, owner, DEP],
  );
  segmentId = segment?.id as string;
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('flight snapshot', () => {
  it('stays closed before the window and opens once at the three-hour check', async () => {
    const early = await pollFlight(
      world.harness.pool,
      {},
      { ref_id: segmentId, slot: 't6' },
      new Date('2026-10-11T19:40:00Z'),
    );
    expect(early.outcome).toBe('skipped');
    expect(await payloads('boarding.soon')).toEqual([]);

    const now = new Date('2026-10-11T22:41:00Z');
    await pollFlight(world.harness.pool, {}, { ref_id: segmentId, slot: 't3' }, now);
    await pollFlight(world.harness.pool, {}, { ref_id: segmentId, slot: 't3' }, now);
    const soon = await payloads('boarding.soon');
    expect(soon).toHaveLength(1);
    expect(boardingSoonPayloadSchema.parse(soon[0])).toMatchObject({
      segment_id: segmentId,
      user_ids: [owner],
      boarding_estimated: true,
    });
    const [row] = await world.q<{ la_phase: string }>(
      'SELECT la_phase FROM flight_segments WHERE id = $1',
      [segmentId],
    );
    expect(row?.la_phase).toBe('check_in');
  });

  it('shows the next flight and a moved gate on the next read', async () => {
    const before = nextFlightSnapshotSchema.parse(await snapshot('2026-10-11T22:45:00Z'));
    expect(before.next_flight).toMatchObject({
      flight: 'SQ 938',
      from: 'SIN',
      to: 'DPS',
      gate: 'B7',
    });
    expect(before.boarding_at).not.toBeNull();

    const now = new Date('2026-10-11T23:10:00Z');
    await withSystem(world.harness.pool, (tx) =>
      applyReading(tx, segmentId, { ...READING, gate: 'C2' }, now),
    );
    const after = await snapshot('2026-10-11T23:11:00Z');
    expect(after.next_flight).toMatchObject({ gate: 'C2', la_phase: 'check_in' });
  });

  it('sends one landing and clears the next flight once it is on the ground', async () => {
    const now = new Date('2026-10-12T04:20:00Z');
    const landed = {
      ...READING,
      gate: 'C2',
      status: 'landed' as const,
      actDepAt: '2026-10-12T01:45:00Z',
      actArrAt: '2026-10-12T04:12:00Z',
    };
    await withSystem(world.harness.pool, (tx) => applyReading(tx, segmentId, landed, now));
    await withSystem(world.harness.pool, (tx) => applyReading(tx, segmentId, landed, now));
    const landings = await payloads('flight.landed');
    expect(landings).toHaveLength(1);
    expect(flightLandedPayloadSchema.parse(landings[0])).toMatchObject({
      segment_id: segmentId,
      source: 'provider',
    });
    const [row] = await world.q<{ la_phase: string }>(
      'SELECT la_phase FROM flight_segments WHERE id = $1',
      [segmentId],
    );
    expect(row?.la_phase).toBe('landed');
    expect((await snapshot('2026-10-12T04:21:00Z')).next_flight).toBeNull();
  });
});
