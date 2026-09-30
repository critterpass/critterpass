/**
 * `flight_segments` (C1): a personal flight's number and times reach the crew unless its owner
 * opted out, in the table and the trip stream alike; the server writes the status.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { FIXTURE_HIDDEN_FLIGHT, FIXTURE_SHARED_FLIGHT } from '../helpers/bookings-fixture';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const byFlight = 'SELECT 1 FROM flight_segments WHERE trip_id = $1 AND flight_no = $2';

describe('flight segments', () => {
  it('shows a crew-visible flight to the crew only', async () => {
    const { actors, tripId } = harness.fixture;
    for (const kind of ['organiser', 'coOrganiser', 'member'] as const) {
      expect(
        await visibleRows(harness, actors[kind], byFlight, [tripId, FIXTURE_SHARED_FLIGHT]),
        kind,
      ).toBe(1);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(
        await visibleRows(harness, actors[kind], byFlight, [tripId, FIXTURE_SHARED_FLIGHT]),
        kind,
      ).toBe(0);
    }
  });

  it('keeps an opted-out flight to its owner', async () => {
    const { actors, tripId } = harness.fixture;
    expect(
      await visibleRows(harness, actors.organiser, byFlight, [tripId, FIXTURE_HIDDEN_FLIGHT]),
    ).toBe(1);
    for (const kind of ['coOrganiser', 'member', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(
        await visibleRows(harness, actors[kind], byFlight, [tripId, FIXTURE_HIDDEN_FLIGHT]),
        kind,
      ).toBe(0);
    }
  });

  it('syncs the same split with the trip', async () => {
    const { tripId } = harness.fixture;
    const flights = async (actor: 'organiser' | 'member' | 'exMember') =>
      ((await harness.rows('trip', actor, { trip_id: tripId })).get('flight_segments') ?? [])
        .map((row) => row['flight_no'])
        .sort();
    expect(await flights('organiser')).toEqual(
      [FIXTURE_SHARED_FLIGHT, FIXTURE_HIDDEN_FLIGHT].sort(),
    );
    expect(await flights('member')).toEqual([FIXTURE_SHARED_FLIGHT]);
    expect(await flights('exMember')).toEqual([]);
  });

  it('refuses a traveller writing their own status', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query("UPDATE flight_segments SET status = 'landed' WHERE trip_id = $1", [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
