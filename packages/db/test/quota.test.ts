/**
 * `app.consume_quota`/`app.release_quota` (packages/db/migrations/*_entitlements_and_meters.sql):
 * the single atomic upsert that makes N concurrent callers agree on exactly `limit` winners, and the
 * tz-abuse guard that stops a claimed period_key change from manufacturing a second free window
 * inside 20h of the last real one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../src/tx';
import { insertUser } from './helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from './helpers/pg-container';

interface ConsumeResult {
  readonly ok: boolean;
  readonly used: number;
  readonly limit: number;
  readonly reset_at: string;
  readonly period_key: string;
}

let container: DbTestContainer;
let db: DbTestDatabase;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function consume(
  subjectId: string,
  metric: string,
  periodKey: string,
  limit: number,
  resetAt: Date = new Date('2026-06-16T00:00:00Z'),
  subjectKind: 'user' | 'trip' = 'user',
): Promise<ConsumeResult> {
  const result = await withSystem(db.pool, (tx) =>
    tx.query<{ consume_quota: ConsumeResult }>(
      'SELECT app.consume_quota($1, $2, $3, $4, $5, $6) AS consume_quota',
      [subjectKind, subjectId, metric, periodKey, limit, resetAt],
    ),
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('app.consume_quota returned no row');
  return row.consume_quota;
}

describe('app.consume_quota', () => {
  it('allows the 30th consume (used=29 -> 30) and rejects the 31st (used stays 30)', async () => {
    const uid = await insertUser(db.pool);
    let last: ConsumeResult | undefined;
    // Sequential by design: each consume must observe the previous one's committed count.
    for (let i = 0; i < 30; i += 1) {
      last = await consume(uid, 'guide_answers', '2026-06-15', 30);
    }
    expect(last).toEqual(
      expect.objectContaining({ ok: true, used: 30, limit: 30, period_key: '2026-06-15' }),
    );

    const rejected = await consume(uid, 'guide_answers', '2026-06-15', 30);
    expect(rejected).toEqual(
      expect.objectContaining({ ok: false, used: 30, limit: 30, period_key: '2026-06-15' }),
    );
  });

  it('50 parallel consumes at limit 30 yield exactly 30 ok and 20 rejected', async () => {
    const tripId = await withSystem(db.pool, async (tx) => {
      // A bare uuidv7(), not a real trips row: app.consume_quota never joins trips, and no FK exists
      // on usage_counters.subject_id (it is intentionally polymorphic).
      const { rows } = await tx.query<{ id: string }>('SELECT uuidv7() AS id');
      const row = rows[0];
      if (row === undefined) throw new Error('expected a generated id');
      return row.id;
    });

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        consume(tripId, 'redrafts', 'trip-window', 30, undefined, 'trip'),
      ),
    );

    const okCount = results.filter((result) => result.ok).length;
    const rejectedCount = results.filter((result) => !result.ok).length;
    expect(okCount).toBe(30);
    expect(rejectedCount).toBe(20);

    const { rows } = await db.pool.query<{ count: number }>(
      "SELECT count FROM usage_counters WHERE subject_kind = 'trip' AND subject_id = $1 AND metric = 'redrafts' AND period_key = 'trip-window'",
      [tripId],
    );
    // Every rejected caller still saw the true count (30), never a stale or over-limit value.
    expect(rows[0]?.count).toBe(30);
  });

  it('honours a genuinely new period_key when none exists yet', async () => {
    const uid = await insertUser(db.pool);
    const result = await consume(uid, 'map_opens', '2026-07-01', 10);
    expect(result).toEqual(
      expect.objectContaining({ ok: true, used: 1, period_key: '2026-07-01' }),
    );
  });

  describe('the 20h reset-abuse guard', () => {
    it('keeps counting against the current period when a new period_key arrives under 20h later', async () => {
      const uid = await insertUser(db.pool);
      const first = await consume(uid, 'guide_answers', '2026-08-01', 30);
      expect(first).toEqual(
        expect.objectContaining({ ok: true, used: 1, period_key: '2026-08-01' }),
      );

      // A device tz change claims a new calendar day almost immediately after the first answer.
      const gamed = await consume(uid, 'guide_answers', '2026-08-02', 30);
      expect(gamed).toEqual(
        expect.objectContaining({ ok: true, used: 2, period_key: '2026-08-01' }),
      );

      const { rows } = await db.pool.query<{ period_key: string; count: number }>(
        "SELECT period_key, count FROM usage_counters WHERE subject_kind = 'user' AND subject_id = $1 AND metric = 'guide_answers'",
        [uid],
      );
      expect(rows).toEqual([{ period_key: '2026-08-01', count: 2 }]);
    });

    it('honours a new period_key once at least 20h have really passed', async () => {
      const uid = await insertUser(db.pool);
      await consume(uid, 'guide_answers', '2026-09-01', 30);

      // Backdate started_at directly (as app_owner, bypassing RLS - a test-fixture-only technique):
      // real time cannot be made to pass 20h inside a test.
      await db.pool.query(
        "UPDATE usage_counters SET started_at = now() - interval '21 hours' WHERE subject_kind = 'user' AND subject_id = $1 AND metric = 'guide_answers'",
        [uid],
      );

      const afterGuardWindow = await consume(uid, 'guide_answers', '2026-09-02', 30);
      expect(afterGuardWindow).toEqual(
        expect.objectContaining({ ok: true, used: 1, period_key: '2026-09-02' }),
      );

      const { rows } = await db.pool.query<{ period_key: string; count: number }>(
        "SELECT period_key, count FROM usage_counters WHERE subject_kind = 'user' AND subject_id = $1 AND metric = 'guide_answers' ORDER BY started_at DESC LIMIT 1",
        [uid],
      );
      expect(rows).toEqual([{ period_key: '2026-09-02', count: 1 }]);
    });
  });
});

describe('app.release_quota', () => {
  it('undoes one consume, so a released reservation can be retaken', async () => {
    const uid = await insertUser(db.pool);
    await consume(uid, 'redrafts', 'trip-x', 3, undefined, 'trip');
    await consume(uid, 'redrafts', 'trip-x', 3, undefined, 'trip');

    const released = await withSystem(db.pool, (tx) =>
      tx.query<{ release_quota: { used: number; limit: number } }>(
        'SELECT app.release_quota($1, $2, $3, $4) AS release_quota',
        ['trip', uid, 'redrafts', 'trip-x'],
      ),
    );
    expect(released.rows[0]?.release_quota).toEqual({ used: 1, limit: 3 });

    const { rows } = await db.pool.query<{ count: number }>(
      "SELECT count FROM usage_counters WHERE subject_kind = 'trip' AND subject_id = $1 AND metric = 'redrafts' AND period_key = 'trip-x'",
      [uid],
    );
    expect(rows[0]?.count).toBe(1);
  });

  it('floors at 0 rather than going negative', async () => {
    const uid = await insertUser(db.pool);
    await consume(uid, 'map_opens', '2026-06-20', 10);

    await withSystem(db.pool, (tx) =>
      tx.query('SELECT app.release_quota($1, $2, $3, $4)', [
        'user',
        uid,
        'map_opens',
        '2026-06-20',
      ]),
    );
    await withSystem(db.pool, (tx) =>
      tx.query('SELECT app.release_quota($1, $2, $3, $4)', [
        'user',
        uid,
        'map_opens',
        '2026-06-20',
      ]),
    );

    const { rows } = await db.pool.query<{ count: number }>(
      "SELECT count FROM usage_counters WHERE subject_kind = 'user' AND subject_id = $1 AND metric = 'map_opens' AND period_key = '2026-06-20'",
      [uid],
    );
    expect(rows[0]?.count).toBe(0);
  });

  it('raises for a subject/metric/period with no row at all', async () => {
    const uid = await insertUser(db.pool);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query('SELECT app.release_quota($1, $2, $3, $4)', [
          'user',
          uid,
          'guide_answers',
          'never-consumed',
        ]),
      ),
    ).rejects.toThrow();
  });
});
