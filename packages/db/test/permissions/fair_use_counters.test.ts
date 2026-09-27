import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let uid: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  uid = await insertUser(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('fair_use_counters RLS: silent, class S (never client-visible)', () => {
  it('is unreadable by app_user, even for the user it counts', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query('SELECT app.bump_fair_use($1, $2, $3, $4)', [
        uid,
        'guide_tokens',
        new Date('2026-06-15T00:00:00Z'),
        300,
      ]),
    );
    await expect(
      withUser(db.pool, uid, anonymousActor().device, (tx) =>
        tx.query('SELECT 1 FROM fair_use_counters WHERE user_id = $1', [uid]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is unreadable by app_system directly (no grant; only app.bump_fair_use may touch it)', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query('SELECT 1 FROM fair_use_counters WHERE user_id = $1', [uid]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is unpublished (never enters the powersync publication)', async () => {
    const { rows } = await db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'fair_use_counters'",
    );
    expect(rows).toEqual([]);
  });

  describe('app.bump_fair_use', () => {
    const windowStart = new Date('2026-06-20T00:00:00Z');

    it('increments unconditionally, never blocking even once over cap', async () => {
      const first = await withSystem(db.pool, (tx) =>
        tx.query<{ bump_fair_use: { count: number; cap: number } }>(
          'SELECT app.bump_fair_use($1, $2, $3, $4) AS bump_fair_use',
          [uid, 'voice_seconds', windowStart, 2],
        ),
      );
      expect(first.rows[0]?.bump_fair_use).toEqual({ count: 1, cap: 2 });

      const second = await withSystem(db.pool, (tx) =>
        tx.query<{ bump_fair_use: { count: number; cap: number } }>(
          'SELECT app.bump_fair_use($1, $2, $3, $4) AS bump_fair_use',
          [uid, 'voice_seconds', windowStart, 2],
        ),
      );
      expect(second.rows[0]?.bump_fair_use).toEqual({ count: 2, cap: 2 });

      // Third call is already over cap: still increments (fair use degrades, it never blocks).
      const third = await withSystem(db.pool, (tx) =>
        tx.query<{ bump_fair_use: { count: number; cap: number } }>(
          'SELECT app.bump_fair_use($1, $2, $3, $4) AS bump_fair_use',
          [uid, 'voice_seconds', windowStart, 2],
        ),
      );
      expect(third.rows[0]?.bump_fair_use).toEqual({ count: 3, cap: 2 });
    });

    it('keeps separate counts per window_start (a new window starts back at 1)', async () => {
      const laterWindow = new Date('2026-06-21T00:00:00Z');
      const result = await withSystem(db.pool, (tx) =>
        tx.query<{ bump_fair_use: { count: number; cap: number } }>(
          'SELECT app.bump_fair_use($1, $2, $3, $4) AS bump_fair_use',
          [uid, 'voice_seconds', laterWindow, 2],
        ),
      );
      expect(result.rows[0]?.bump_fair_use).toEqual({ count: 1, cap: 2 });
    });

    it('rejects a metric outside the closed set', async () => {
      await expect(
        withSystem(db.pool, (tx) =>
          tx.query('SELECT app.bump_fair_use($1, $2, $3, $4)', [
            uid,
            'not_a_real_metric',
            new Date(),
            10,
          ]),
        ),
      ).rejects.toThrow();
    });
  });
});
