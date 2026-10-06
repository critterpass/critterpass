/**
 * `driver_listings` (C2, phone and key hashes C3): any signed-in member reads a listed driver's
 * public columns and nothing else: never a paused or taken-down listing, never his number, phone
 * hash or key, never a write. Removing a listing deletes its stats, flags and tips with it, while
 * the crews' own answers and invites stay, unlinked.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
const ids: Record<'listed' | 'paused' | 'removed', string> = {
  listed: '',
  paused: '',
  removed: '',
};

async function system<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.db.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

beforeAll(async () => {
  harness = await startStreamHarness();
  for (const status of ['listed', 'paused', 'removed'] as const) {
    const rows = await system<{ id: string }>(
      `INSERT INTO driver_listings (display_name, areas, phone_e164_enc, phone_hash, status,
         consent_version, consent_at, key_hash)
       VALUES ($1, '{Ubud}', 'enc', $2, $3, 'v1', now(), $4) RETURNING id`,
      [`Driver ${status}`, `phone-${status}`, status, `key-${status}`],
    );
    ids[status] = rows[0]?.id ?? '';
  }
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('driver_listings public projection', () => {
  it('shows members the listed driver only', async () => {
    const { outsider } = harness.fixture.actors;
    const rows = await withUser(harness.db.pool, outsider, randomUUID(), (tx) =>
      tx.query<{ id: string }>('SELECT id, display_name, areas, status FROM driver_listings'),
    );
    expect(rows.rows.map((row) => row.id)).toEqual([ids.listed]);
  });

  it('never exposes his number, phone hash or key', async () => {
    const { member } = harness.fixture.actors;
    for (const column of [
      'phone_e164_enc',
      'phone_hash',
      'key_hash',
      'prev_key_hash',
      'consent_at',
    ]) {
      await expect(
        withUser(harness.db.pool, member, randomUUID(), (tx) =>
          tx.query(`SELECT ${column} FROM driver_listings`),
        ),
        column,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('refuses every client write', async () => {
    const { organiser } = harness.fixture.actors;
    await expect(
      withUser(harness.db.pool, organiser, randomUUID(), (tx) =>
        tx.query("UPDATE driver_listings SET status = 'listed'"),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(harness.db.pool, organiser, randomUUID(), (tx) =>
        tx.query('DELETE FROM driver_listing_stats'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('removal deletes stats, flags and tips; crews keep their answers and invites', async () => {
    const { organiser } = harness.fixture.actors;
    const { tripId } = harness.fixture;
    const listing = ids.listed;
    await system('INSERT INTO driver_listing_stats (listing_id, crews_rated) VALUES ($1, 1)', [
      listing,
    ]);
    await system(
      `INSERT INTO driver_listing_flags (listing_id, kind, evidence) VALUES ($1, 'rating_ring', '{}')`,
      [listing],
    );
    const link = `SELECT p.id, t.id AS tid, t.crew_id FROM providers p JOIN trips t ON t.id = p.trip_id
                   WHERE t.id = $2 LIMIT 1`;
    await system(
      `INSERT INTO driver_ratings (listing_id, provider_id, trip_id, crew_id, user_id, verdict)
       SELECT $1, x.id, x.tid, x.crew_id, $3, 'loved'
         FROM (${link}) x`,
      [listing, tripId, organiser],
    );
    await system(
      `INSERT INTO driver_tips (listing_id, provider_id, trip_id, crew_id, text, crew_size, month)
       SELECT $1, x.id, x.tid, x.crew_id, 'Upper car park.', 4, '2026-10-01'
         FROM (${link}) x`,
      [listing, tripId],
    );
    await system(
      `INSERT INTO driver_invites (listing_id, provider_id, trip_id, crew_id, token_hash, phone_hash,
         status, expires_at)
       SELECT $1, x.id, x.tid, x.crew_id, 'tok-removal', 'phone-listed', 'claimed', now()
         FROM (${link}) x`,
      [listing, tripId],
    );

    await system('DELETE FROM driver_listings WHERE id = $1', [listing]);

    for (const table of ['driver_listing_stats', 'driver_listing_flags', 'driver_tips']) {
      expect(
        await system(`SELECT 1 FROM ${table} WHERE listing_id = $1`, [listing]),
        table,
      ).toEqual([]);
    }
    expect(await system("SELECT 1 FROM driver_tips WHERE text = 'Upper car park.'")).toEqual([]);
    expect(
      await system('SELECT listing_id FROM driver_ratings WHERE user_id = $1', [organiser]),
    ).toEqual([{ listing_id: null }]);
    expect(
      await system("SELECT listing_id FROM driver_invites WHERE token_hash = 'tok-removal'"),
    ).toEqual([{ listing_id: null }]);
  });
});
