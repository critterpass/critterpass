/**
 * `ride_quotes` and `rides` (C1, RLS T read): the trip's crew reads Grab quotes and logged rides
 * through the api and sync, nobody writes them through app_user, and a logged ride with a price
 * always carries its currency.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('rides', () => {
  it('quotes are read by the crew of the trip only and written by nobody through app_user', async () => {
    await expectCrewReadOnly(harness, 'ride_quotes');
  });

  it('rides are read by the crew of the trip only and written by nobody through app_user', async () => {
    await expectCrewReadOnly(harness, 'rides');
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query(
          `INSERT INTO rides (trip_id, leg_ref, provider, mode, attendee_ids, logged_by)
           VALUES ($1, 'x', 'grab', 'app_link', $2, $3)`,
          [tripId, [actors.organiser], actors.organiser],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses a price without its currency', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO rides (trip_id, leg_ref, provider, mode, attendee_ids, logged_by, price_minor)
           VALUES ($1, 'x', 'grab', 'app_link', $2, $3, 6000000)`,
          [tripId, [actors.organiser], actors.organiser],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});
