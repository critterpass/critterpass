/**
 * `providers` (C1, RLS T read): the trip's crew reads its live providers and nobody else does;
 * the sealed contact is never selectable or synced, and a removed provider is gone for everyone.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { FIXTURE_PROVIDER_NAME, FIXTURE_REMOVED_PROVIDER_NAME } from '../helpers/suppliers-fixture';
import { expectCrewReadOnly, visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('providers', () => {
  it('are read by the crew of the trip only, and written by nobody through app_user', async () => {
    await expectCrewReadOnly(harness, 'providers');
  });

  it('never show the sealed contact to a member or through sync', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query('SELECT contact_enc FROM providers'),
      ),
    ).rejects.toThrow(/permission denied/i);
    const synced = await harness.rows('trip', 'member', { trip_id: tripId });
    const rows = synced.get('providers') ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).not.toHaveProperty('contact_enc');
  });

  it('hides a removed provider from the crew and from sync', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM providers WHERE trip_id = $1 AND name = $2';
    expect(await visibleRows(harness, actors.member, probe, [tripId, FIXTURE_PROVIDER_NAME])).toBe(
      1,
    );
    expect(
      await visibleRows(harness, actors.member, probe, [tripId, FIXTURE_REMOVED_PROVIDER_NAME]),
    ).toBe(0);
    const synced = await harness.rows('trip', 'member', { trip_id: tripId });
    expect((synced.get('providers') ?? []).map((row) => row['name'])).toEqual([
      FIXTURE_PROVIDER_NAME,
    ]);
  });
});
