/**
 * Flight commands on the real stack. Adding a flight arms its schedule checks and boarding ping;
 * `watch_flight` re-arms them for anyone who can see the flight and nobody else. A traveller
 * reports landing once (`flight.landed` exactly once), a crewmate who is not on the flight cannot,
 * and only the owner hides a personal flight's number and times from the crew.
 */
import { withUser } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { MoneyCrew, MoneyHarness } from '../money/money-harness';
import { buildMoneyCrew } from '../money/money-harness';
import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import { startBookingsHarness } from './bookings-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;
const flightId = generateUuidV7();
const DEPARTS = new Date(Date.now() + 10 * 86_400_000);

beforeAll(async () => {
  harness = await startBookingsHarness();
  crew = await buildMoneyCrew(harness, 3);
  const [, maya] = crew.members as [SignedIn, SignedIn];
  const added = await harness.run(maya, 'add_booking', {
    booking_id: flightId,
    trip_id: crew.tripId,
    kind: 'flight',
    title: 'SQ 938 · SIN → DPS',
    segments: [
      {
        carrier: 'SQ',
        flight_no: '938',
        dep_airport: 'SIN',
        arr_airport: 'DPS',
        sched_dep_at: DEPARTS.toISOString(),
      },
    ],
  });
  if (added.status !== 200) throw new Error(JSON.stringify(added.body));
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function timers(): Promise<string[]> {
  const { rows } = await harness.pool.query<{ kind: string; slot: string }>(
    `SELECT e.kind, e.slot FROM scheduled_events e JOIN flight_segments s ON s.id = e.ref_id
      WHERE s.booking_id = $1 AND e.status = 'pending' ORDER BY e.kind, e.slot`,
    [flightId],
  );
  return rows.map((row) => `${row.kind}:${row.slot}`);
}

describe('watching a flight', () => {
  it('arms the checks and the boarding ping when the flight is added, and re-arms on request', async () => {
    const expected = [
      'boarding.schedule:',
      'flight.poll:t24',
      'flight.poll:t3',
      'flight.poll:t6',
      'flight.poll:t72',
    ];
    expect(await timers()).toEqual(expected);
    const [organiser, maya] = crew.members as [SignedIn, SignedIn];
    expect(resultOf(await harness.run(maya, 'watch_flight', { booking_id: flightId }))).toEqual({
      booking_id: flightId,
      timers: 5,
    });
    expect(await timers()).toEqual(expected);
    expect((await harness.run(organiser, 'watch_flight', { booking_id: flightId })).status).toBe(
      404,
    );
  });
});

describe('reporting a landing', () => {
  it('is a traveller’s, and lands the flight once', async () => {
    const [organiser, maya] = crew.members as [SignedIn, SignedIn];
    await harness.run(maya, 'set_booking_visibility', { booking_id: flightId, visibility: 'crew' });
    expect(
      errorOf(await harness.run(organiser, 'report_landed', { booking_id: flightId })).code,
    ).toBe('FORBIDDEN');
    expect(resultOf(await harness.run(maya, 'report_landed', { booking_id: flightId }))).toEqual({
      booking_id: flightId,
      status: 'landed',
    });
    await harness.run(maya, 'report_landed', { booking_id: flightId });
    const landed = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'flight.landed' AND payload->>'booking_id' = $1",
      [flightId],
    );
    expect(landed.rowCount).toBe(1);
  });
});

describe('hiding a flight from the crew', () => {
  it('is the owner’s choice, and hides the segment from crewmates', async () => {
    const [organiser, maya] = crew.members as [SignedIn, SignedIn];
    await harness.run(maya, 'set_booking_visibility', {
      booking_id: flightId,
      visibility: 'personal',
    });
    expect(
      errorOf(
        await harness.run(organiser, 'set_flight_crew_visibility', {
          booking_id: flightId,
          visible: false,
        }),
      ).code,
    ).toBe('NOT_FOUND');
    expect(
      (
        await harness.run(maya, 'set_flight_crew_visibility', {
          booking_id: flightId,
          visible: false,
        })
      ).status,
    ).toBe(200);
    const seen = await withUser(harness.pool, organiser.uid, 'test', (tx) =>
      tx.query('SELECT 1 FROM flight_segments WHERE booking_id = $1', [flightId]),
    );
    expect(seen.rowCount).toBe(0);
  });
});
