/**
 * `ftf_grants` (C2, RLS M): the crew sees its first-trip-free grant; one per crew; the organiser's
 * abuse keys stay in the ops schema, out of every client's reach.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { expectCrewBillingTable } from '../helpers/billing-fixture';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('ftf_grants', () => {
  it('is crew-visible, read-only and synced with the crew', async () => {
    await expectCrewBillingTable(harness, 'ftf_grants', 'crews');
  });

  it('grants once per crew and keeps abuse keys unreadable to app_user', async () => {
    const { crewId, tripId, actors } = harness.fixture;
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO ftf_grants (crew_id, trip_id, organiser_id, starts_at, ends_at,
             member_overlap_hash) VALUES ($1, $2, $3, now(), now() + interval '1 day', $4)`,
          [crewId, tripId, actors.member, 'c'.repeat(64)],
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('SELECT 1 FROM ops.ftf_abuse_keys'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
