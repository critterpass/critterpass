import { AI_TIERS } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computePublicationAllowList } from '../../src/publication';
import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: TripFixture;

const INSERT = `INSERT INTO ai_usage (user_id, trip_id, model, tier, tokens_in, tokens_out, cache_read, cost_micros)
  VALUES ($1, $2, 'deepseek-flash', 'fast', 100, 10, 40, 30)`;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildTripFixture(db.pool);
  await withSystem(db.pool, (tx) => tx.query(INSERT, [fixture.memberId, fixture.tripId]));
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('ai_usage: RLS class S, app_system only', () => {
  it.each(['outsiderId', 'memberId', 'organiserId'] as const)(
    'denies %s any read, even of their own cost rows',
    async (actor) => {
      await expect(
        withUser(db.pool, fixture[actor], anonymousActor().device, (tx) =>
          tx.query('SELECT 1 FROM ai_usage'),
        ),
      ).rejects.toThrow(/permission denied/i);
    },
  );

  it('denies an app_user insert', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, (tx) =>
        tx.query(INSERT, [fixture.memberId, fixture.tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('denies guide_reader', async () => {
    await expect(
      withGuideReader(db.pool, fixture.memberId, fixture.tripId, (tx) =>
        tx.query('SELECT 1 FROM ai_usage'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system record and read, and re-link the user but not rewrite a cost', async () => {
    const count = await withSystem(db.pool, async (tx) => {
      await tx.query(INSERT, [null, null]);
      const { rows } = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM ai_usage');
      return rows[0]?.n;
    });
    expect(count).toBe(2);
    await withSystem(db.pool, (tx) =>
      tx.query('UPDATE ai_usage SET user_id = NULL WHERE user_id = $1', [fixture.memberId]),
    );
    await expect(
      withSystem(db.pool, (tx) => tx.query('UPDATE ai_usage SET tokens_out = 0')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects a cache-read count larger than the prompt', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO ai_usage (model, tier, tokens_in, tokens_out, cache_read, cost_micros)
           VALUES ('deepseek-v4-pro', 'pro', 10, 1, 11, 1)`,
        ),
      ),
    ).rejects.toThrow(/ai_usage_counts_check/);
  });

  it('is never published to PowerSync', () => {
    expect(computePublicationAllowList()).not.toContain('ai_usage');
  });

  it('records a Jev decision call', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO ai_usage (model, tier, tokens_in, tokens_out, cache_read, cost_micros)
         VALUES ('jev-1.13.0', 'jev', 431, 80, 0, 18)`,
      ),
    );
  });
});

// A migration that adds a tier rewrites the whole CHECK list, so a list copied from an older main
// would silently drop tiers added since; the domain's AI_TIERS is the source of truth.
describe('ai_usage tier check', () => {
  it('allows exactly the tiers in the domain list', async () => {
    const result = await db.pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'ai_usage'::regclass AND conname = 'ai_usage_tier_check'`,
    );
    const allowed = [...(result.rows[0]?.def ?? '').matchAll(/'([^']+)'::text/g)].map(
      (match) => match[1],
    );
    expect(allowed.sort()).toEqual([...AI_TIERS].sort());
  });

  it('rejects a tier outside the list', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO ai_usage (model, tier, tokens_in, tokens_out, cache_read, cost_micros)
           VALUES ('gpt', 'other', 1, 1, 0, 1)`,
        ),
      ),
    ).rejects.toThrow(/ai_usage_tier_check/);
  });
});
