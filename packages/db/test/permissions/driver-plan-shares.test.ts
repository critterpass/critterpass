/**
 * `driver_plan_shares` (C1, RLS T; token columns C2): the crew reads its trip's driver links (who,
 * which days, expiry, open count) but never the token or its hash, nobody outside the crew sees
 * them, no client writes them, and a driver has one live link per trip.
 */
import { createHash, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

const hash = (token: string) => createHash('sha256').update(token, 'utf8').digest();

async function insertShare(token: string, driver = 'Made'): Promise<string> {
  const { tripId, versionId } = harness.fixture;
  return withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO driver_plan_shares
         (trip_id, driver_name, itinerary_version_id, day_nos, token_hash, token_enc, expires_at)
       VALUES ($1, $2, $3, ARRAY[1], $4, 'sealed', now() + interval '14 days') RETURNING id`,
      [tripId, driver, versionId, hash(token)],
    );
    return rows[0]!.id;
  });
}

beforeAll(async () => {
  harness = await startStreamHarness();
  await insertShare('first-link');
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('driver_plan_shares', () => {
  it('is read by the crew only', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT id, open_count, expires_at FROM driver_plan_shares WHERE trip_id = $1';
    for (const kind of ['member', 'organiser', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBeGreaterThan(0);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
  });

  it('never lets a member read the token, its hash or the PDF key', async () => {
    const { actors, tripId } = harness.fixture;
    for (const column of ['token_hash', 'token_enc', 'pdf_key']) {
      await expect(
        withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
          tx.query(`SELECT ${column} FROM driver_plan_shares WHERE trip_id = $1`, [tripId]),
        ),
        column,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('is never written by a member', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('UPDATE driver_plan_shares SET revoked_at = now() WHERE trip_id = $1', [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps one live link per driver per trip', async () => {
    await expect(insertShare('second-link')).rejects.toThrow(/driver_plan_shares_live_key/);
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        "UPDATE driver_plan_shares SET revoked_at = now() WHERE trip_id = $1 AND driver_name = 'Made'",
        [harness.fixture.tripId],
      ),
    );
    await expect(insertShare('second-link')).resolves.toBeTruthy();
  });

  it('accepts a driver-authored change set', async () => {
    const { tripId, versionId } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, ops)
         VALUES ($1, $2, 'driver', 'provider', $3, '[]')`,
        [tripId, versionId, randomUUID()],
      ),
    );
  });
});
