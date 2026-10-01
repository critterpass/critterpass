import { runMigrations, withSystem } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  recomputeTrip,
  recomputeUser,
  registerTripSourceLoader,
  registerUserSourceLoader,
  resetSourceLoadersForTests,
} from '../../src/entitlements';
import { insertCrewWithTrip, insertUser } from './db-fixtures';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
}, 240_000);

afterEach(() => {
  resetSourceLoadersForTests();
});

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

async function outboxCountFor(uid: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*)::text FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'entitlement.changed'",
    [`user:#${uid}`],
  );
  return Number(rows[0]?.count ?? '0');
}

describe('recomputeUser', () => {
  it('resolves to Free with no sources registered (the true state before any purchase exists)', async () => {
    const uid = await insertUser(pool);
    const row = await withSystem(pool, (tx) => recomputeUser(tx, uid));

    expect(row).toMatchObject({
      userId: uid,
      passPlus: false,
      guideUnlimitedGlobal: false,
      iconStyles: [],
      expiresAt: null,
    });
    const { rows } = await pool.query<{ pass_plus: boolean }>(
      'SELECT pass_plus FROM user_entitlements WHERE user_id = $1',
      [uid],
    );
    expect(rows).toEqual([{ pass_plus: false }]);
  });

  it('writes exactly one entitlement.changed rt_outbox row on user:#uid', async () => {
    const uid = await insertUser(pool);
    await withSystem(pool, (tx) => recomputeUser(tx, uid));
    expect(await outboxCountFor(uid)).toBe(1);
  });

  it('resolves Pass+ from a registered user source loader; icon_styles becomes ["all"]', async () => {
    const uid = await insertUser(pool);
    registerUserSourceLoader(({ uid: loaderUid }) =>
      Promise.resolve(
        loaderUid === uid
          ? [{ kind: 'store_sub', status: 'active', currentPeriodEnd: '2027-01-01T00:00:00Z' }]
          : [],
      ),
    );

    const row = await withSystem(pool, (tx) => recomputeUser(tx, uid));
    expect(row.passPlus).toBe(true);
    expect(row.guideUnlimitedGlobal).toBe(true);
    expect(row.iconStyles).toEqual(['all']);
    // An actively auto-renewing sub has no known end while it keeps renewing.
    expect(row.expiresAt).toBeNull();
  });

  it('sets expires_at to the store period end for a cancelled-but-still-in-period subscription', async () => {
    const uid = await insertUser(pool);
    registerUserSourceLoader(() =>
      Promise.resolve([
        { kind: 'store_sub', status: 'cancelled_active', currentPeriodEnd: '2026-12-01T00:00:00Z' },
      ]),
    );

    const row = await withSystem(pool, (tx) =>
      recomputeUser(tx, uid, { now: () => new Date('2026-06-15T00:00:00Z') }),
    );
    expect(row.passPlus).toBe(true);
    expect(row.expiresAt?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('is idempotent: recomputing twice updates the same row, not a duplicate', async () => {
    const uid = await insertUser(pool);
    await withSystem(pool, (tx) => recomputeUser(tx, uid));
    await withSystem(pool, (tx) => recomputeUser(tx, uid));
    const { rows } = await pool.query('SELECT 1 FROM user_entitlements WHERE user_id = $1', [uid]);
    expect(rows).toHaveLength(1);
  });
});

describe('recomputeTrip', () => {
  it('resolves to Free with no sources registered: seat cap 6, redraft limit 3, no live map', async () => {
    const { tripId } = await insertCrewWithTrip(pool, 2);
    const row = await withSystem(pool, (tx) => recomputeTrip(tx, tripId));

    expect(row).toMatchObject({
      tripId,
      boostActive: false,
      seatCap: 6,
      redraftLimit: 3,
      liveMap: false,
      sponsored: true,
    });
    const { rows } = await pool.query<{ seat_cap: number; redraft_limit: number }>(
      'SELECT seat_cap, redraft_limit FROM trips WHERE id = $1',
      [tripId],
    );
    expect(rows).toEqual([{ seat_cap: 6, redraft_limit: 3 }]);
  });

  it('registering a source loader flips a trip to 16 seats and notifies every crew member', async () => {
    const { tripId, memberUids } = await insertCrewWithTrip(pool, 3);
    registerTripSourceLoader(({ tripId: loaderTripId }) =>
      Promise.resolve(
        loaderTripId === tripId
          ? [
              {
                kind: 'trip_boost' as const,
                tripId,
                startsAt: '2026-06-01T00:00:00Z',
                endsAt: '2026-07-01T00:00:00Z',
                status: 'active' as const,
              },
            ]
          : [],
      ),
    );

    const row = await withSystem(pool, (tx) =>
      recomputeTrip(tx, tripId, { now: () => new Date('2026-06-15T00:00:00Z') }),
    );
    expect(row).toMatchObject({
      boostActive: true,
      seatCap: 16,
      redraftLimit: Infinity,
      liveMap: true,
      sponsored: false,
    });

    const { rows: tripRows } = await pool.query<{ seat_cap: number; redraft_limit: number }>(
      'SELECT seat_cap, redraft_limit FROM trips WHERE id = $1',
      [tripId],
    );
    expect(tripRows[0]?.seat_cap).toBe(16);
    expect(tripRows[0]?.redraft_limit).toBe(2_147_483_647);

    for (const uid of memberUids) {
      expect(await outboxCountFor(uid)).toBe(1);
    }
  });

  it('is idempotent: recomputing twice updates the same row, not a duplicate', async () => {
    const { tripId } = await insertCrewWithTrip(pool, 1);
    await withSystem(pool, (tx) => recomputeTrip(tx, tripId));
    await withSystem(pool, (tx) => recomputeTrip(tx, tripId));
    const { rows } = await pool.query('SELECT 1 FROM trip_entitlements WHERE trip_id = $1', [
      tripId,
    ]);
    expect(rows).toHaveLength(1);
  });
});
