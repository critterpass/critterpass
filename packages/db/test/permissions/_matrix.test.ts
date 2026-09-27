/**
 * Exercises `TABLE_MATRIX` (./_matrix.ts) against one shared fixture (read-only `select` sweep
 * across every table), then a coverage guard (every RLS-enabled `public` table has FORCE RLS and a
 * matrix entry; `app_user` has no DELETE grant anywhere), then a handful of isolated-database
 * `insert`/`update` spot-checks — one per distinct RLS shape this schema uses, rather than
 * re-running all 21 tables' writes (each already proven by its own file under this directory).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { ACTOR_KINDS, buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { probeSelect, TABLE_MATRIX } from './_matrix';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe.each(Object.entries(TABLE_MATRIX))('permission matrix: %s', (table, entry) => {
  it.each(ACTOR_KINDS)('select as %s', async (kind) => {
    const uid = fixture.actors[kind];
    const device = anonymousActor().device;
    const found = await probeSelect(db.pool, uid, device, entry.selectProbe, fixture);
    expect(found).toBe(entry.expectations[kind].select);
  });
});

describe('matrix coverage', () => {
  it('gives every RLS-enabled public table a matrix entry with FORCE RLS on', async () => {
    const { rows } = await db.pool.query<{ tablename: string; relforcerowsecurity: boolean }>(
      `SELECT c.relname AS tablename, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.relforcerowsecurity, `${row.tablename} should FORCE RLS`).toBe(true);
      expect(TABLE_MATRIX[row.tablename], `${row.tablename} should have a matrix entry`).toBeDefined();
    }
  });

  it('never grants app_user DELETE on any table', async () => {
    const { rows } = await db.pool.query(
      "SELECT table_schema, table_name FROM information_schema.role_table_grants WHERE grantee = 'app_user' AND privilege_type = 'DELETE'",
    );
    expect(rows).toEqual([]);
  });
});

describe('insert/update spot-checks (one per distinct RLS shape)', () => {
  async function withIsolatedFixture(
    run: (pool: typeof db.pool, fx: PermissionFixture) => Promise<void>,
  ): Promise<void> {
    const isolated = await container.createDatabase();
    try {
      const fx = await buildPermissionFixture(isolated.pool);
      await run(isolated.pool, fx);
    } finally {
      await isolated.drop();
    }
  }

  it('self-only insert: any actor may create their own user_settings row', () =>
    withIsolatedFixture(async (pool, fx) => {
      await expect(
        withUser(pool, fx.actors.outsider, anonymousActor().device, (tx) =>
          tx.query('INSERT INTO user_settings (user_id) VALUES ($1)', [fx.actors.outsider]),
        ),
      ).resolves.toBeDefined();
    }));

  it('any active crew member may insert: a non-member is rejected, a member is accepted', () =>
    withIsolatedFixture(async (pool, fx) => {
      await expect(
        withUser(pool, fx.actors.outsider, anonymousActor().device, (tx) =>
          tx.query(
            "INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, ops) VALUES ($1, $2, 'manual', 'user', $3, '[]'::jsonb)",
            [fx.tripId, fx.versionId, fx.actors.outsider],
          ),
        ),
      ).rejects.toThrow(/permission denied|row-level security/i);
      await expect(
        withUser(pool, fx.actors.member, anonymousActor().device, (tx) =>
          tx.query(
            "INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, ops) VALUES ($1, $2, 'manual', 'user', $3, '[]'::jsonb)",
            [fx.tripId, fx.versionId, fx.actors.member],
          ),
        ),
      ).resolves.toBeDefined();
    }));

  it('organiser-only insert: a plain member is rejected, an organiser is accepted', () =>
    withIsolatedFixture(async (pool, fx) => {
      await expect(
        withUser(pool, fx.actors.member, anonymousActor().device, (tx) =>
          tx.query("INSERT INTO itinerary_versions (trip_id, visibility) VALUES ($1, 'crew')", [fx.tripId]),
        ),
      ).rejects.toThrow(/permission denied|row-level security/i);
      await expect(
        withUser(pool, fx.actors.coOrganiser, anonymousActor().device, (tx) =>
          tx.query("INSERT INTO itinerary_versions (trip_id, visibility) VALUES ($1, 'crew')", [fx.tripId]),
        ),
      ).resolves.toBeDefined();
    }));

  it('system-only, no app_user grant at all: plan_items rejects every app_user insert', () =>
    withIsolatedFixture(async (pool, fx) => {
      await expect(
        withUser(pool, fx.actors.organiser, anonymousActor().device, (tx) =>
          tx.query('INSERT INTO plan_items (version_id, day_id, trip_id) VALUES ($1, $2, $3)', [
            fx.versionId,
            fx.dayId,
            fx.tripId,
          ]),
        ),
      ).rejects.toThrow(/permission denied/i);
    }));

  it('organiser-only update: a plain member cannot change the trip, a co-organiser can', () =>
    withIsolatedFixture(async (pool, fx) => {
      await withUser(pool, fx.actors.member, anonymousActor().device, (tx) =>
        tx.query("UPDATE trips SET local_currency = 'IDR' WHERE id = $1", [fx.tripId]),
      );
      const afterMember = await pool.query<{ local_currency: string | null }>(
        'SELECT local_currency FROM trips WHERE id = $1',
        [fx.tripId],
      );
      expect(afterMember.rows[0]?.local_currency).not.toBe('IDR');

      await withUser(pool, fx.actors.coOrganiser, anonymousActor().device, (tx) =>
        tx.query("UPDATE trips SET local_currency = 'IDR' WHERE id = $1", [fx.tripId]),
      );
      const afterCoOrganiser = await pool.query<{ local_currency: string | null }>(
        'SELECT local_currency FROM trips WHERE id = $1',
        [fx.tripId],
      );
      expect(afterCoOrganiser.rows[0]?.local_currency).toBe('IDR');
    }));
});
