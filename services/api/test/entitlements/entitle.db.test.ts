import { DomainError } from '@cp/domain';
import { runMigrations, withSystem, withUser } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { entitle, releaseQuota } from '../../src/entitlements';
import { insertCrewWithTrip, insertUser, randomId } from './db-fixtures';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

async function usageRow(
  subjectKind: 'user' | 'trip',
  subjectId: string,
  metric: string,
): Promise<{ count: number } | undefined> {
  const { rows } = await pool.query<{ count: number }>(
    'SELECT count FROM usage_counters WHERE subject_kind = $1 AND subject_id = $2 AND metric = $3',
    [subjectKind, subjectId, metric],
  );
  return rows[0];
}

describe('entitle: quota', () => {
  it('reserves the 30th guide answer and rejects the 31st with QUOTA_EXHAUSTED', async () => {
    const uid = await insertUser(pool);
    for (let i = 0; i < 30; i += 1) {
      const reservation = await withSystem(pool, (tx) =>
        entitle(
          tx,
          { uid, deviceTz: 'Asia/Singapore', now: new Date('2026-06-15T04:00:00Z') },
          { kind: 'quota', metric: 'guide_answers', limit: 30 },
        ),
      );
      expect(reservation).toEqual({
        subjectKind: 'user',
        subjectId: uid,
        metric: 'guide_answers',
        periodKey: '2026-06-15',
      });
    }

    await expect(
      withSystem(pool, (tx) =>
        entitle(
          tx,
          { uid, deviceTz: 'Asia/Singapore', now: new Date('2026-06-15T05:00:00Z') },
          { kind: 'quota', metric: 'guide_answers', limit: 30 },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'QUOTA_EXHAUSTED',
      detail: { used: 30, limit: 30 },
    });
  });

  it('is exempt (no usage_counters row at all) for a Pass+/Boost asker', async () => {
    const uid = await insertUser(pool);
    const reservation = await withSystem(pool, (tx) =>
      entitle(
        tx,
        { uid, deviceTz: 'UTC', now: new Date('2026-06-15T00:00:00Z') },
        { kind: 'quota', metric: 'guide_answers', limit: 30, askerGuideUnlimited: true },
      ),
    );
    expect(reservation).toBeUndefined();
    expect(await usageRow('user', uid, 'guide_answers')).toBeUndefined();
  });

  it('is exempt in crew chat when another member holds Pass+', async () => {
    const uid = await insertUser(pool);
    const reservation = await withSystem(pool, (tx) =>
      entitle(
        tx,
        { uid, deviceTz: 'UTC', now: new Date('2026-06-15T00:00:00Z') },
        {
          kind: 'quota',
          metric: 'guide_answers',
          limit: 30,
          isCrewChat: true,
          crewPassHolders: ['maya'],
        },
      ),
    );
    expect(reservation).toBeUndefined();
    expect(await usageRow('user', uid, 'guide_answers')).toBeUndefined();
  });

  it('leaves usage_counters unchanged when the reserving transaction rolls back', async () => {
    const uid = await insertUser(pool);
    const marker = new Error('deliberate rollback');

    await expect(
      withUser(pool, uid, randomId(), async (tx) => {
        await entitle(
          tx,
          { uid, deviceTz: 'UTC', now: new Date('2026-06-15T00:00:00Z') },
          { kind: 'quota', metric: 'guide_answers', limit: 30 },
        );
        throw marker;
      }),
    ).rejects.toThrow(marker);

    expect(await usageRow('user', uid, 'guide_answers')).toBeUndefined();
  });

  it('releaseQuota undoes a committed reservation', async () => {
    const uid = await insertUser(pool);
    await withSystem(pool, (tx) =>
      entitle(
        tx,
        { uid, deviceTz: 'UTC', now: new Date('2026-06-20T00:00:00Z') },
        { kind: 'quota', metric: 'guide_answers', limit: 30 },
      ),
    );
    expect(await usageRow('user', uid, 'guide_answers')).toEqual({ count: 1 });

    await withSystem(pool, (tx) =>
      releaseQuota(tx, {
        subjectKind: 'user',
        subjectId: uid,
        metric: 'guide_answers',
        periodKey: '2026-06-20',
      }),
    );
    expect(await usageRow('user', uid, 'guide_answers')).toEqual({ count: 0 });
  });
});

describe('entitle: capability', () => {
  it('throws ENTITLEMENT_REQUIRED with offers looked up from products.grants', async () => {
    const uid = await insertUser(pool);
    await withSystem(pool, (tx) =>
      tx.query(
        `INSERT INTO products (key, type, grants) VALUES ('pass_monthly', 'auto_renew_sub', '["pass_plus"]'::jsonb)
         ON CONFLICT (key) DO UPDATE SET grants = EXCLUDED.grants`,
      ),
    );

    await expect(
      withSystem(pool, (tx) =>
        entitle(tx, { uid, deviceTz: 'UTC' }, { kind: 'capability', key: 'pass_plus' }),
      ),
    ).rejects.toMatchObject({
      code: 'ENTITLEMENT_REQUIRED',
      detail: { perk: 'pass_plus', offers: ['pass_monthly'] },
    });
  });

  it('resolves without throwing once user_entitlements grants the capability', async () => {
    const uid = await insertUser(pool);
    await withSystem(pool, (tx) =>
      tx.query(
        'INSERT INTO user_entitlements (user_id, pass_plus) VALUES ($1, true) ON CONFLICT (user_id) DO UPDATE SET pass_plus = true',
        [uid],
      ),
    );

    await expect(
      withSystem(pool, (tx) =>
        entitle(tx, { uid, deviceTz: 'UTC' }, { kind: 'capability', key: 'pass_plus' }),
      ),
    ).resolves.toBeUndefined();
  });

  it('grants guide_unlimited from a trip Boost even without user-level Pass+', async () => {
    const uid = await insertUser(pool);
    const { tripId } = await insertCrewWithTrip(pool, 1);
    await withSystem(pool, (tx) =>
      tx.query(
        'INSERT INTO trip_entitlements (trip_id, boost_active) VALUES ($1, true) ON CONFLICT (trip_id) DO UPDATE SET boost_active = true',
        [tripId],
      ),
    );

    await expect(
      withSystem(pool, (tx) =>
        entitle(
          tx,
          { uid, deviceTz: 'UTC' },
          { kind: 'capability', key: 'guide_unlimited', tripId },
        ),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('entitle: seat', () => {
  it('rejects with offer "boost" once every free seat is held', async () => {
    const { tripId } = await insertCrewWithTrip(pool, 6);
    await withSystem(pool, (tx) =>
      tx.query('INSERT INTO trip_entitlements (trip_id) VALUES ($1)', [tripId]),
    );

    await expect(
      withSystem(pool, (tx) =>
        entitle(tx, { uid: randomId(), deviceTz: 'UTC' }, { kind: 'seat', tripId }),
      ),
    ).rejects.toMatchObject({ code: 'SEAT_LIMIT', detail: { cap: 6, offer: 'boost' } });
  });

  it('rejects with offer "waitlist" once a boosted trip is also full', async () => {
    const { tripId } = await insertCrewWithTrip(pool, 6);
    await withSystem(pool, (tx) =>
      tx.query(
        'INSERT INTO trip_entitlements (trip_id, boost_active, seat_cap) VALUES ($1, true, 6)',
        [tripId],
      ),
    );

    await expect(
      withSystem(pool, (tx) =>
        entitle(tx, { uid: randomId(), deviceTz: 'UTC' }, { kind: 'seat', tripId }),
      ),
    ).rejects.toMatchObject({ code: 'SEAT_LIMIT', detail: { cap: 6, offer: 'waitlist' } });
  });

  it('allows a seat under the cap', async () => {
    const { tripId } = await insertCrewWithTrip(pool, 2);
    await withSystem(pool, (tx) =>
      tx.query('INSERT INTO trip_entitlements (trip_id) VALUES ($1)', [tripId]),
    );

    await expect(
      withSystem(pool, (tx) =>
        entitle(tx, { uid: randomId(), deviceTz: 'UTC' }, { kind: 'seat', tripId }),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('entitle: redraft', () => {
  it('reserves up to the free-tier cap of 3 and rejects the 4th', async () => {
    const { tripId } = await insertCrewWithTrip(pool, 1);
    await withSystem(pool, (tx) =>
      tx.query('INSERT INTO trip_entitlements (trip_id) VALUES ($1)', [tripId]),
    );

    for (let i = 0; i < 3; i += 1) {
      const reservation = await withSystem(pool, (tx) =>
        entitle(tx, { uid: randomId(), deviceTz: 'UTC' }, { kind: 'redraft', tripId }),
      );
      expect(reservation).toEqual({
        subjectKind: 'trip',
        subjectId: tripId,
        metric: 'redrafts',
        periodKey: 'lifetime',
      });
    }

    await expect(
      withSystem(pool, (tx) =>
        entitle(tx, { uid: randomId(), deviceTz: 'UTC' }, { kind: 'redraft', tripId }),
      ),
    ).rejects.toMatchObject({ code: 'REDRAFT_LIMIT', detail: { used: 3, limit: 3 } });
  });

  it('never reserves a visible unit for an unlimited trip (only the silent fair-use count)', async () => {
    const { tripId } = await insertCrewWithTrip(pool, 1);
    await withSystem(pool, (tx) =>
      tx.query(
        'INSERT INTO trip_entitlements (trip_id, boost_active, redraft_limit) VALUES ($1, true, 2147483647)',
        [tripId],
      ),
    );

    const uid = await insertUser(pool);
    const reservation = await withSystem(pool, (tx) =>
      entitle(tx, { uid, deviceTz: 'UTC' }, { kind: 'redraft', tripId }),
    );
    expect(reservation).toBeUndefined();
    expect(await usageRow('trip', tripId, 'redrafts')).toBeUndefined();
  });
});

describe('DomainError shape', () => {
  it('every thrown rejection is a real DomainError instance', async () => {
    const uid = await insertUser(pool);
    try {
      await withSystem(pool, (tx) =>
        entitle(tx, { uid, deviceTz: 'UTC' }, { kind: 'capability', key: 'pass_plus' }),
      );
      throw new Error('expected entitle to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
    }
  });
});
